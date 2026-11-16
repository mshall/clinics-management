import { BadRequestException } from "@nestjs/common";
import { Prisma, RevenueStatus, type TransferVerificationStatus } from "@prisma/client";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { assertEtaBuyerNameAtPayment } from "./eta-buyer-name";
import { queueFiscalDocument, type QueueFiscalParams } from "./fiscal-queue";

export type PostRevenueWithFiscalParams = {
  tenantId: string;
  clinicId: string;
  category: string;
  description?: string | null;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  currency?: string;
  postedAt?: Date;
  status?: RevenueStatus;
  patientId?: string | null;
  operationId?: string | null;
  encounterId?: string | null;
  appointmentId?: string | null;
  buyerName?: string | null;
  clinicTaxRin?: string | null;
  vatPercent?: number;
  collectionMode?: QueueFiscalParams["collectionMode"];
  transferChannel?: string | null;
  transferReference?: string | null;
  transferVerificationStatus?: TransferVerificationStatus;
  billingPaymentMethods?: QueueFiscalParams["billingPaymentMethods"];
  /** Skip fiscal queue (e.g. zero amount or explicit void-only rows). */
  skipFiscalQueue?: boolean;
};

async function resolvePatientId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  params: PostRevenueWithFiscalParams,
): Promise<string | null> {
  if (params.patientId?.trim()) return params.patientId.trim();
  if (params.operationId?.trim()) {
    const op = await tx.operation.findFirst({
      where: { id: params.operationId.trim(), tenantId },
      select: { patientId: true },
    });
    return op?.patientId ?? null;
  }
  if (params.encounterId?.trim()) {
    const enc = await tx.encounter.findFirst({
      where: { id: params.encounterId.trim(), tenantId },
      select: { patientId: true },
    });
    return enc?.patientId ?? null;
  }
  if (params.appointmentId?.trim()) {
    const apt = await tx.appointment.findFirst({
      where: { id: params.appointmentId.trim(), tenantId },
      select: { patientId: true },
    });
    return apt?.patientId ?? null;
  }
  return null;
}

async function resolveBuyerName(
  tx: Prisma.TransactionClient,
  tenantId: string,
  patientId: string | null,
  override?: string | null,
): Promise<string | undefined> {
  const explicit = override?.trim();
  if (explicit) return explicit;
  if (!patientId) return undefined;
  const patient = await tx.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { firstNameEn: true, lastNameEn: true },
  });
  if (!patient) return undefined;
  return `${patient.firstNameEn} ${patient.lastNameEn}`.trim() || undefined;
}

/** Single money path: post revenue and queue ETA receipt in the same transaction. */
export async function postRevenueWithFiscal(
  tx: Prisma.TransactionClient,
  params: PostRevenueWithFiscalParams,
): Promise<{ revenueEntryId: string }> {
  const status = params.status ?? RevenueStatus.POSTED;
  const currency =
    params.currency?.trim() ||
    (await resolveClinicCurrency(tx as unknown as import("../prisma/prisma.service").PrismaService, params.tenantId, params.clinicId));
  const net = params.netAmount;
  const gross = params.grossAmount;
  const tax = params.taxAmount;

  const patientId = await resolvePatientId(tx, params.tenantId, params);
  const buyerName = await resolveBuyerName(tx, params.tenantId, patientId, params.buyerName);

  if (status === RevenueStatus.POSTED && net > 0) {
    assertEtaBuyerNameAtPayment(net, currency, buyerName);
  }

  const row = await tx.revenueEntry.create({
    data: {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      category: params.category,
      description: params.description ?? null,
      grossAmount: new Prisma.Decimal(String(gross)),
      taxAmount: new Prisma.Decimal(String(tax)),
      netAmount: new Prisma.Decimal(String(net)),
      currency,
      postedAt: params.postedAt ?? new Date(),
      status,
      operationId: params.operationId?.trim() || null,
      encounterId: params.encounterId?.trim() || null,
      appointmentId: params.appointmentId?.trim() || null,
      ...(params.collectionMode !== undefined ? { collectionMode: params.collectionMode } : {}),
      ...(params.transferChannel !== undefined ? { transferChannel: params.transferChannel } : {}),
      ...(params.transferReference !== undefined ? { transferReference: params.transferReference } : {}),
      ...(params.transferVerificationStatus !== undefined
        ? { transferVerificationStatus: params.transferVerificationStatus }
        : {}),
    },
  });

  if (
    !params.skipFiscalQueue &&
    status === RevenueStatus.POSTED &&
    net > 0 &&
    patientId
  ) {
    const clinic = await tx.clinic.findFirst({
      where: { id: params.clinicId, tenantId: params.tenantId },
      select: { taxRegistrationNumber: true, invoiceVatPercent: true },
    });
    await queueFiscalDocument(tx, {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      patientId,
      revenueEntryId: row.id,
      totalAmount: net,
      currency,
      vatPercent: params.vatPercent ?? Number(clinic?.invoiceVatPercent ?? 0),
      description: params.description?.trim() || params.category,
      clinicTaxRin: params.clinicTaxRin ?? clinic?.taxRegistrationNumber,
      buyerName,
      collectionMode: params.collectionMode,
      transferChannel: params.transferChannel,
      transferReference: params.transferReference,
      billingPaymentMethods: params.billingPaymentMethods,
    });
  } else if (status === RevenueStatus.POSTED && net > 0 && !patientId && !params.skipFiscalQueue) {
    throw new BadRequestException(
      "Cannot post receiptable revenue without a patient (link operation, encounter, or appointment)",
    );
  }

  return { revenueEntryId: row.id };
}