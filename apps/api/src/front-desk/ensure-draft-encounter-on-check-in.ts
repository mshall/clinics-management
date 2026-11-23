import { AppointmentStatus, EncounterStatus, Prisma, ServiceLocation } from "@prisma/client";
import { syncEncounterVisitFeeFromAppointmentSchedule } from "../appointments/appointment-visit-fee-sync";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { effectiveTenantVisitFee } from "../common/effective-tenant-visit-fee";

/** Longest chief complaint copied from the appointment notes (the Encounter field is free text). */
const CHIEF_COMPLAINT_MAX = 500;

/**
 * Draft encounter linked to appointment; patient stays WAITING until Start visit. Idempotent.
 * ADR-039: a telehealth (VIDEO) appointment gets visitType "Telehealth", the chief complaint from the appointment notes, and is
 * created ONCE for any encounter status (a signed one also blocks a duplicate); a per-appointment advisory lock plus the partial
 * unique index `Encounter_appointmentId_telehealth_key` make concurrent attendance + manual check-in race-safe.
 */
export async function ensureDraftEncounterOnCheckIn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<string | null> {
  const apt = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true, clinicId: true, patientId: true, clinicianId: true, feeAmount: true, serviceLocation: true, notes: true },
  });
  if (!apt) return null;
  const telehealth = apt.serviceLocation === ServiceLocation.VIDEO;

  if (telehealth) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telehealth-encounter:${apt.id}`}))`;
  const existing = await tx.encounter.findFirst({
    where: {
      tenantId,
      appointmentId: apt.id,
      ...(telehealth ? {} : { status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] } }),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const [tenant, currency] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: { defaultVisitFee: true, market: true } }),
    resolveClinicCurrency(tx, tenantId, apt.clinicId),
  ]);
  const feeFromApt = Number(apt.feeAmount);
  const visitFee =
    Number.isFinite(feeFromApt) && feeFromApt >= 0
      ? feeFromApt
      : effectiveTenantVisitFee(tenant ?? { defaultVisitFee: null }, tenant?.market ?? null);

  const enc = await tx.encounter.create({
    data: {
      tenantId,
      clinicId: apt.clinicId,
      patientId: apt.patientId,
      clinicianId: apt.clinicianId,
      appointmentId: apt.id,
      visitType: telehealth ? "Telehealth" : "Outpatient",
      ...(telehealth && apt.notes?.trim() ? { chiefComplaint: apt.notes.trim().slice(0, CHIEF_COMPLAINT_MAX) } : {}),
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