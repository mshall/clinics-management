import { EtaReceiptStatus, Prisma, TransferVerificationStatus, type VisitCollectionMode } from "@prisma/client";
import { buildIdempotencyKey, signEtaPayload, type EtaReceiptPayload } from "./eta-egypt.client";

export type QueueEtaReceiptParams = {
  tenantId: string;
  clinicId: string;
  patientId: string;
  totalAmount: number;
  currency: string;
  vatPercent?: number;
  description: string;
  revenueEntryId?: string;
  paymentId?: string;
  invoiceId?: string;
  collectionMode?: VisitCollectionMode | null;
  transferChannel?: string | null;
  transferReference?: string | null;
  clinicTaxRin?: string | null;
};

export async function queueEtaReceipt(tx: Prisma.TransactionClient, params: QueueEtaReceiptParams): Promise<void> {
  if (params.totalAmount <= 0) return;

  const idempotencyKey = buildIdempotencyKey([
    params.tenantId,
    params.revenueEntryId ?? "",
    params.paymentId ?? "",
    params.invoiceId ?? "",
    String(params.totalAmount),
    params.currency,
  ]);

  const existing = await tx.etaReceiptSubmission.findFirst({
    where: {
      OR: [
        { idempotencyKey },
        ...(params.revenueEntryId ? [{ revenueEntryId: params.revenueEntryId }] : []),
        ...(params.paymentId ? [{ paymentId: params.paymentId }] : []),
        ...(params.invoiceId ? [{ invoiceId: params.invoiceId }] : []),
      ],
    },
    select: { id: true },
  });
  if (existing) return;

  const payload: EtaReceiptPayload = {
    issuerRin: params.clinicTaxRin?.trim() || process.env.ETA_DEFAULT_ISSUER_RIN?.trim() || "PENDING-RIN",
    branchCode: params.clinicId.slice(0, 8),
    documentType: "EI",
    taxpayerActivityCode: process.env.ETA_TAXPAYER_ACTIVITY_CODE?.trim() || "8690",
    lines: [
      {
        description: params.description,
        quantity: 1,
        unitPrice: params.totalAmount,
        vatPercent: params.vatPercent ?? 0,
        currency: params.currency,
      },
    ],
    totalAmount: params.totalAmount,
    currency: params.currency,
    patientId: params.patientId,
    clinicId: params.clinicId,
    idempotencyKey,
  };

  const signature = signEtaPayload(payload);

  await tx.etaReceiptSubmission.create({
    data: {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      patientId: params.patientId,
      paymentId: params.paymentId,
      revenueEntryId: params.revenueEntryId,
      invoiceId: params.invoiceId,
      status: EtaReceiptStatus.PENDING,
      idempotencyKey,
      signature: signature || null,
      payloadJson: {
        ...payload,
        collectionMode: params.collectionMode,
        transferChannel: params.transferChannel,
        transferReference: params.transferReference,
      } as unknown as Prisma.InputJsonValue,
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