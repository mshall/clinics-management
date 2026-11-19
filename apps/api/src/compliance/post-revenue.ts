import { BadRequestException } from "@nestjs/common";
import { Prisma, RevenueStatus, type TransferVerificationStatus, type VisitCollectionMode } from "@prisma/client";
import { resolveClinicCurrency } from "../common/clinic-currency";

export type PostRevenueParams = {
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
  collectionMode?: VisitCollectionMode | null;
  transferChannel?: string | null;
  transferReference?: string | null;
  transferVerificationStatus?: TransferVerificationStatus;
  counterpartyName?: string | null;
  counterpartyTaxNumber?: string | null;
  clinicTaxRin?: string | null;
  vatPercent?: number;
};

export const SAMPLE_PATIENT_NO_REVENUE = "SAMPLE_PATIENT_NO_REVENUE";

/** ON-08 — sample ("try it") patients never produce revenue. */
async function assertNotSamplePatient(tx: Prisma.TransactionClient, params: PostRevenueParams): Promise<void> {
  const tenantId = params.tenantId;
  const or: Prisma.PatientWhereInput[] = [];
  if (params.patientId?.trim()) or.push({ id: params.patientId.trim() });
  if (params.appointmentId?.trim()) or.push({ appointments: { some: { id: params.appointmentId.trim() } } });
  if (params.encounterId?.trim()) or.push({ encounters: { some: { id: params.encounterId.trim() } } });
  if (params.operationId?.trim()) or.push({ operations: { some: { id: params.operationId.trim() } } });
  if (!or.length) return;
  const sample = await tx.patient.findFirst({ where: { tenantId, isSample: true, OR: or }, select: { id: true } });
  if (sample) {
    throw new BadRequestException({
      message: "Sample patient — payments are not recorded for demo data",
      code: SAMPLE_PATIENT_NO_REVENUE,
    });
  }
}

/** Single money path (FD-02): post revenue only — no ETA / fiscal queue. */
export async function postRevenue(
  tx: Prisma.TransactionClient,
  params: PostRevenueParams,
): Promise<{ revenueEntryId: string }> {
  await assertNotSamplePatient(tx, params);
  const status = params.status ?? RevenueStatus.POSTED;
  const currency =
    params.currency?.trim() ||
    (await resolveClinicCurrency(
      tx as unknown as import("../prisma/prisma.service").PrismaService,
      params.tenantId,
      params.clinicId,
    ));
  const net = params.netAmount;
  const gross = params.grossAmount;
  const tax = params.taxAmount;

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
      ...(params.counterpartyName?.trim() ? { counterpartyName: params.counterpartyName.trim() } : {}),
      ...(params.counterpartyTaxNumber?.trim()
        ? { counterpartyTaxNumber: params.counterpartyTaxNumber.trim() }
        : {}),
    },
  });

  return { revenueEntryId: row.id };
}