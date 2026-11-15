import { randomUUID } from "crypto";
import { FiscalSubmissionStatus, Prisma, TransferVerificationStatus, type VisitCollectionMode } from "@prisma/client";
import { fiscalProviderKeyForMarket, getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import { buildFiscalIdempotencyKey, fiscalSourceRefFromQueue } from "./fiscal-idempotency";

export type QueueFiscalParams = {
  tenantId: string;
  clinicId: string;
  patientId: string;
  totalAmount: number;
  currency?: string;
  vatPercent?: number;
  description: string;
  revenueEntryId?: string;
  paymentId?: string;
  invoiceId?: string;
  collectionMode?: VisitCollectionMode | null;
  transferChannel?: string | null;
  transferReference?: string | null;
  clinicTaxRin?: string | null;
  /** Void / credit receipt for a voided visit-fee revenue row */
  returnForRevenueEntryId?: string;
};

/** @deprecated use queueFiscalDocument */
export const queueEtaReceipt = queueFiscalDocument;

export async function queueFiscalDocument(tx: Prisma.TransactionClient, params: QueueFiscalParams): Promise<void> {
  if (params.totalAmount <= 0) return;

  const flags = new FeatureFlagsService(tx as unknown as PrismaService);
  if (!(await flags.isEnabled(params.tenantId, "eta_receipts"))) return;

  const clinic = await tx.clinic.findFirst({
    where: { id: params.clinicId, tenantId: params.tenantId },
    select: {
      etaReceiptsEnabled: true,
      etaBranchCode: true,
      etaTaxpayerActivityCode: true,
      etaDefaultItemCode: true,
      taxRegistrationNumber: true,
      invoiceVatPercent: true,
      tenantId: true,
    },
  });
  if (clinic && !clinic.etaReceiptsEnabled) return;

  const marketCtx = await resolveMarketForTenant(tx as unknown as import("../prisma/prisma.service").PrismaService, params.tenantId);
  const providerKey = fiscalProviderKeyForMarket(marketCtx.taxConfig);
  const provider = getFiscalProvider(providerKey);
  if (!provider) return;

  const currency = params.currency?.trim() || marketCtx.currency;
  const sourceRef = fiscalSourceRefFromQueue(params);
  const idempotencyKey = buildFiscalIdempotencyKey(providerKey, sourceRef);
  const returnSale = sourceRef.kind === "return";
  const lastSubmitted = await tx.fiscalSubmission.findFirst({
    where: {
      clinicId: params.clinicId,
      tenantId: params.tenantId,
      providerKey,
      status: { in: [FiscalSubmissionStatus.SUBMITTED, FiscalSubmissionStatus.ACCEPTED] },
      providerDocumentUuid: { not: null },
    },
    orderBy: { submittedAt: "desc" },
    select: { providerDocumentUuid: true },
  });
  const built = provider.buildPayload({
    tenantId: params.tenantId,
    clinicId: params.clinicId,
    patientId: params.patientId,
    totalAmount: params.totalAmount,
    currency,
    vatPercent: params.vatPercent ?? Number(clinic?.invoiceVatPercent ?? 0),
    description: params.description,
    taxConfig: marketCtx.taxConfig,
    clinicOverrides: {
      etaBranchCode: clinic?.etaBranchCode,
      etaTaxpayerActivityCode: clinic?.etaTaxpayerActivityCode,
      etaDefaultItemCode: clinic?.etaDefaultItemCode,
      taxRegistrationNumber: params.clinicTaxRin ?? clinic?.taxRegistrationNumber,
    },
    idempotencyKey,
    receiptUuid: randomUUID(),
    previousReceiptUuid: lastSubmitted?.providerDocumentUuid ?? null,
    documentNature: returnSale ? "return" : "sale",
  });

  const existingDoc = await tx.fiscalDocument.findFirst({
    where: {
      OR: [
        ...(params.revenueEntryId ? [{ revenueEntryId: params.revenueEntryId }] : []),
        ...(params.paymentId ? [{ paymentId: params.paymentId }] : []),
        ...(params.invoiceId ? [{ invoiceId: params.invoiceId }] : []),
      ],
    },
    select: { id: true },
  });
  if (existingDoc) return;

  const dupSubmission = await tx.fiscalSubmission.findFirst({
    where: { idempotencyKey: built.idempotencyKey },
    select: { id: true },
  });
  if (dupSubmission) return;

  const doc = await tx.fiscalDocument.create({
    data: {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      patientId: params.patientId,
      providerKey,
      paymentId: params.paymentId,
      revenueEntryId: params.revenueEntryId,
      invoiceId: params.invoiceId,
      currency,
      totalAmount: new Prisma.Decimal(String(params.totalAmount)),
      payloadJson: {
        ...(typeof built.payloadJson === "object" && built.payloadJson !== null && !Array.isArray(built.payloadJson)
          ? built.payloadJson
          : {}),
        collectionMode: params.collectionMode,
        transferChannel: params.transferChannel,
        transferReference: params.transferReference,
      } as Prisma.InputJsonValue,
      schemaVersion: built.schemaVersion,
    },
  });

  await tx.fiscalSubmission.create({
    data: {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      patientId: params.patientId,
      fiscalDocumentId: doc.id,
      providerKey,
      status: FiscalSubmissionStatus.PENDING,
      idempotencyKey: built.idempotencyKey,
      signature: built.signature || null,
      payloadJson: built.payloadJson,
    },
  });
}

export function transferVerificationStatusForCollection(
  hasTransfer: boolean,
  verified: boolean,
  skipped: boolean,
): TransferVerificationStatus {
  if (!hasTransfer) return TransferVerificationStatus.NOT_APPLICABLE;
  if (verified) return TransferVerificationStatus.VERIFIED;
  if (skipped) return TransferVerificationStatus.PENDING;
  return TransferVerificationStatus.REJECTED;
}