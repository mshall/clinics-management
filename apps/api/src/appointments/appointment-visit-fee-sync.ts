import { RevenueStatus, VisitCollectionMode, type Prisma } from "@prisma/client";
import { findPostedAppointmentVisitCharge, upsertEncounterVisitFeeRevenue } from "../common/visit-fee-ledger";
import { resolveClinicCurrency } from "../common/clinic-currency";

/** After draft encounter exists: receivable visit fee when booking planned transfer without check-in payment. */
export async function syncEncounterVisitFeeFromAppointmentSchedule(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
  encounterId: string,
): Promise<void> {
  const apt = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      feeAmount: true,
      scheduledCollectionMode: true,
      scheduledTransferChannel: true,
      clinicId: true,
      patientId: true,
      checkInPaymentAmount: true,
    },
  });
  if (!apt) return;

  const fee = Number(apt.feeAmount);
  if (!Number.isFinite(fee) || fee <= 0) return;
  if (apt.scheduledCollectionMode !== VisitCollectionMode.MONEY_TRANSFER) return;

  const checkInPaid = Number(apt.checkInPaymentAmount ?? 0);
  if (checkInPaid > 0.001) return;

  const existingPosted = await findPostedAppointmentVisitCharge(tx, tenantId, appointmentId);
  if (existingPosted && Number(existingPosted.grossAmount) > 0) return;

  const enc = await tx.encounter.findFirst({
    where: { id: encounterId, tenantId },
    select: { clinicId: true, visitFeeCurrency: true },
  });
  if (!enc) return;

  const currency =
    enc.visitFeeCurrency?.trim() ||
    (await resolveClinicCurrency(tx, tenantId, enc.clinicId));

  const receivableExists = await tx.revenueEntry.findFirst({
    where: {
      tenantId,
      encounterId,
      category: "VISIT_FEE",
      status: RevenueStatus.RECEIVABLE,
    },
    select: { id: true },
  });
  if (receivableExists) return;

  await upsertEncounterVisitFeeRevenue(tx, {
    tenantId,
    clinicId: enc.clinicId,
    encounterId,
    appointmentId,
    amount: fee,
    currency,
    patientId: apt.patientId,
    pendingTransferCollection: true,
    scheduledTransferChannel: apt.scheduledTransferChannel,
  });
}