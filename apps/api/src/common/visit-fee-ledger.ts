import { EncounterStatus, Prisma, RevenueStatus, type TransferVerificationStatus } from "@prisma/client";
import { isBaseCurrency } from "./base-currencies";
import { resolveClinicCurrency } from "./clinic-currency";
import { collectionFieldsFromParsed, type ParsedVisitCollection } from "./visit-collection";
import { queueEtaReceipt } from "../compliance/eta-receipt-queue";

export async function upsertEncounterVisitFeeRevenue(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    appointmentId: string | null;
    amount: number;
    currency?: string;
    collection?: ParsedVisitCollection;
    patientId: string;
    transferVerificationStatus?: TransferVerificationStatus;
    clinicTaxRin?: string | null;
    vatPercent?: number;
  },
): Promise<void> {
  const { tenantId, clinicId, encounterId, appointmentId, amount, currency: currencyOpt } = params;
  const existingRevenue = await tx.revenueEntry.findFirst({
    where: { tenantId, encounterId, category: "VISIT_FEE" },
  });

  const currency =
    currencyOpt?.trim() && isBaseCurrency(currencyOpt.trim())
      ? currencyOpt.trim()
      : await resolveClinicCurrency(tx, tenantId, clinicId);

  const collectionData = params.collection ? collectionFieldsFromParsed(params.collection) : {};

  if (amount > 0) {
    const revenueData = {
      grossAmount: new Prisma.Decimal(String(amount)),
      netAmount: new Prisma.Decimal(String(amount)),
      taxAmount: new Prisma.Decimal("0"),
      currency,
      appointmentId,
      description: `Visit fee · encounter ${encounterId.slice(0, 8)}…`,
      ...(params.transferVerificationStatus !== undefined
        ? { transferVerificationStatus: params.transferVerificationStatus }
        : {}),
      ...collectionData,
    };
    let revenueId: string;
    if (existingRevenue) {
      const updated = await tx.revenueEntry.update({ where: { id: existingRevenue.id }, data: revenueData });
      revenueId = updated.id;
    } else {
      const created = await tx.revenueEntry.create({
        data: {
          tenantId,
          clinicId,
          encounterId,
          category: "VISIT_FEE",
          postedAt: new Date(),
          status: RevenueStatus.POSTED,
          ...revenueData,
        },
      });
      revenueId = created.id;
    }
    await queueEtaReceipt(tx, {
      tenantId,
      clinicId,
      patientId: params.patientId,
      revenueEntryId: revenueId,
      totalAmount: amount,
      currency,
      vatPercent: params.vatPercent ?? 0,
      description: revenueData.description,
      clinicTaxRin: params.clinicTaxRin,
      collectionMode: params.collection?.collectionMode,
      transferChannel: params.collection?.transferChannel,
      transferReference: params.collection?.transferReference,
    });
    return;
  }

  if (existingRevenue) {
    const voidAmount = Number(existingRevenue.grossAmount);
    await tx.revenueEntry.update({
      where: { id: existingRevenue.id },
      data: {
        status: RevenueStatus.VOID,
        grossAmount: new Prisma.Decimal("0"),
        netAmount: new Prisma.Decimal("0"),
      },
    });
    if (voidAmount > 0) {
      await queueEtaReceipt(tx, {
        tenantId,
        clinicId,
        patientId: params.patientId,
        returnForRevenueEntryId: existingRevenue.id,
        totalAmount: voidAmount,
        currency: existingRevenue.currency,
        vatPercent: params.vatPercent ?? 0,
        description: `Return · ${existingRevenue.description ?? "Visit fee"}`,
        clinicTaxRin: params.clinicTaxRin,
      });
    }
  }
}

export async function syncOpenEncounterVisitFeeFromAppointment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
  feeAmount: number,
): Promise<void> {
  const encounter = await tx.encounter.findFirst({
    where: {
      tenantId,
      appointmentId,
      status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, clinicId: true, visitFeeCurrency: true, patientId: true },
  });
  if (!encounter) return;

  await tx.encounter.update({
    where: { id: encounter.id },
    data: { visitFeeAmount: new Prisma.Decimal(String(feeAmount)) },
  });
  await upsertEncounterVisitFeeRevenue(tx, {
    tenantId,
    clinicId: encounter.clinicId,
    encounterId: encounter.id,
    appointmentId,
    amount: feeAmount,
    currency: encounter.visitFeeCurrency,
    patientId: encounter.patientId,
  });
}
