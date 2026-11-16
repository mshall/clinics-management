import { AppointmentStatus, EncounterStatus, type Prisma } from "@prisma/client";
import { syncEncounterVisitFeeFromAppointmentSchedule } from "../appointments/appointment-visit-fee-sync";
import { resolveClinicCurrency } from "../common/clinic-currency";

/** Draft encounter linked to appointment; patient stays WAITING until Start visit. Idempotent. */
export async function ensureDraftEncounterOnCheckIn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<string | null> {
  const apt = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true, clinicId: true, patientId: true, clinicianId: true, feeAmount: true },
  });
  if (!apt) return null;

  const existing = await tx.encounter.findFirst({
    where: {
      tenantId,
      appointmentId: apt.id,
      status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const [tenant, currency] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: { defaultVisitFee: true } }),
    resolveClinicCurrency(tx, tenantId, apt.clinicId),
  ]);
  const feeFromApt = Number(apt.feeAmount);
  const visitFee =
    Number.isFinite(feeFromApt) && feeFromApt >= 0 ? feeFromApt : Number(tenant?.defaultVisitFee ?? 0);

  const enc = await tx.encounter.create({
    data: {
      tenantId,
      clinicId: apt.clinicId,
      patientId: apt.patientId,
      clinicianId: apt.clinicianId,
      appointmentId: apt.id,
      visitType: "Outpatient",
      status: EncounterStatus.DRAFT,
      visitFeeAmount: visitFee,
      visitFeeCurrency: currency,
    },
    select: { id: true },
  });
  await syncEncounterVisitFeeFromAppointmentSchedule(tx, tenantId, apt.id, enc.id);
  return enc.id;
}

/** Heal CHECKED_IN appointments that have no open encounter (e.g. legacy status-only check-in). */
export async function ensureDraftEncounterIfCheckedIn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<string | null> {
  const apt = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { status: true },
  });
  if (!apt || apt.status !== AppointmentStatus.CHECKED_IN) return null;
  return ensureDraftEncounterOnCheckIn(tx, tenantId, appointmentId);
}