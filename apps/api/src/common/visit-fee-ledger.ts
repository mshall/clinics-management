import { EncounterStatus, Prisma, RevenueStatus } from "@prisma/client";
import { resolveClinicCurrency } from "./clinic-currency";

export async function upsertEncounterVisitFeeRevenue(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    appointmentId: string | null;
    amount: number;
  },
): Promise<void> {
  const { tenantId, clinicId, encounterId, appointmentId, amount } = params;
  const existingRevenue = await tx.revenueEntry.findFirst({
    where: { tenantId, encounterId, category: "VISIT_FEE" },
  });

  if (amount > 0) {
    const currency = await resolveClinicCurrency(tx, tenantId, clinicId);
    const revenueData = {
      grossAmount: new Prisma.Decimal(String(amount)),
      netAmount: new Prisma.Decimal(String(amount)),
      taxAmount: new Prisma.Decimal("0"),
      currency,
      appointmentId,
      description: `Visit fee · encounter ${encounterId.slice(0, 8)}…`,
    };
    if (existingRevenue) {
      await tx.revenueEntry.update({ where: { id: existingRevenue.id }, data: revenueData });
    } else {
      await tx.revenueEntry.create({
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
    }
    return;
  }

  if (existingRevenue) {
    await tx.revenueEntry.delete({ where: { id: existingRevenue.id } });
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
  });
}
