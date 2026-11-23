import { AppointmentStatus, EncounterStatus, ServiceLocation, TelehealthSessionStatus, type BookingSource, type Prisma } from "@prisma/client";
import { enqueueTelehealthEvent, telehealthCreatedData, TELEHEALTH_EVENT } from "./telehealth-events";

type Tx = Prisma.TransactionClient;
export type TelehealthAptRow = {
  id: string; tenantId: string; clinicId: string; patientId: string; clinicianId: string; startsAt: Date; endsAt: Date | null;
  externalReference: string | null; bookingSource: BookingSource; platformIntegrationClientId: string | null; status: AppointmentStatus; serviceLocation: ServiceLocation;
};

/** Creates the one session of a VIDEO appointment (idempotent: unique appointmentId), emits telehealth.session.created. Pure Prisma, no DI. */
export async function ensureTelehealthSession(tx: Tx, apt: TelehealthAptRow, createdByUserId: string | null): Promise<{ id: string; created: boolean }> {
  const existing = await tx.telehealthSession.findUnique({ where: { appointmentId: apt.id } });
  if (existing) {
    if (existing.status === TelehealthSessionStatus.CANCELLED && apt.status !== AppointmentStatus.CANCELLED) {
      // converted back to telehealth: the same link (linkVersion unchanged) comes back to life
      await tx.telehealthSession.update({ where: { id: existing.id }, data: { status: TelehealthSessionStatus.SCHEDULED, endReason: null, endedAt: null, clinicianUserId: apt.clinicianId } });
    }
    return { id: existing.id, created: false };
  }
  const s = await tx.telehealthSession.create({
    data: { tenantId: apt.tenantId, clinicId: apt.clinicId, appointmentId: apt.id, patientId: apt.patientId, clinicianUserId: apt.clinicianId, createdByUserId },
  });
  await enqueueTelehealthEvent(tx, { tenantId: apt.tenantId, type: TELEHEALTH_EVENT.CREATED, sessionId: s.id, data: telehealthCreatedData(s, apt), bookingSource: apt.bookingSource, platformIntegrationClientId: apt.platformIntegrationClientId });
  return { id: s.id, created: true };
}

/**
 * Keeps the session in step with edits to the appointment (called inside AppointmentsService transactions):
 * time moves need nothing (window is computed at join), doctor change reassigns, VIDEO<->in-person converts, cancel cancels.
 */
export async function syncTelehealthWithAppointment(
  tx: Tx,
  apt: TelehealthAptRow,
  previous: { clinicianId: string; serviceLocation: ServiceLocation; status: AppointmentStatus },
  actorId: string | null,
): Promise<void> {
  const session = await tx.telehealthSession.findUnique({ where: { appointmentId: apt.id } });
  const now = new Date();
  const finished = (st: TelehealthSessionStatus) => st === TelehealthSessionStatus.ENDED || st === TelehealthSessionStatus.CANCELLED;
  if (apt.serviceLocation === ServiceLocation.VIDEO) {
    if (apt.status === AppointmentStatus.CANCELLED) {
      if (session && !finished(session.status)) {
        await tx.telehealthSession.update({ where: { id: session.id }, data: { status: TelehealthSessionStatus.CANCELLED, endReason: "CANCELLED", endedAt: now } });
      }
      return;
    }
    if (apt.status === AppointmentStatus.NO_SHOW) {
      if (session && (session.status === TelehealthSessionStatus.SCHEDULED || session.status === TelehealthSessionStatus.WAITING)) {
        await tx.telehealthSession.update({ where: { id: session.id }, data: { status: TelehealthSessionStatus.MISSED, missedAt: now } });
      }
      return;
    }
    if (!session || previous.serviceLocation !== ServiceLocation.VIDEO || previous.status === AppointmentStatus.CANCELLED) {
      await ensureTelehealthSession(tx, apt, actorId);
    } else if (session.clinicianUserId !== apt.clinicianId) {
      await tx.telehealthSession.update({ where: { id: session.id }, data: { clinicianUserId: apt.clinicianId } });
    }
    if (previous.clinicianId !== apt.clinicianId) {
      // reassigned doctor: the draft encounter follows (finalized notes are never touched)
      await tx.encounter.updateMany({ where: { tenantId: apt.tenantId, appointmentId: apt.id, status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] } }, data: { clinicianId: apt.clinicianId } });
    }
  } else if (session && !finished(session.status)) {
    await tx.telehealthSession.update({ where: { id: session.id }, data: { status: TelehealthSessionStatus.CANCELLED, endReason: "CONVERTED_IN_PERSON", endedAt: now } });
  }
}
