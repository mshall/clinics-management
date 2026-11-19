import { BadRequestException } from "@nestjs/common";
import { AppointmentStatus, BookingSource, Prisma } from "@prisma/client";

/** Bookings the patient made through Kiorex (marketplace, WhatsApp, clinic link) — patient sees clinic cancellations. */
const KIOREX_PATIENT_SOURCES = new Set<BookingSource>([
  BookingSource.KIOREX_MARKETPLACE,
  BookingSource.KIOREX_WHATSAPP,
  BookingSource.CLINIC_LINK,
]);

export const CANCELLATION_REASON_REQUIRED = "CANCELLATION_REASON_REQUIRED";
export const CANCELLATION_REASON_MAX = 500;

export type ClinicCancellationPatch = {
  cancelledAt: Date;
  cancelledBy: string;
  cancellationReason: string | null;
  depositRefundable?: boolean;
};

export function isKiorexPatientBooking(source: BookingSource): boolean {
  return KIOREX_PATIENT_SOURCES.has(source);
}

/**
 * KX-06: a clinic cancelling a Kiorex booking must give a reason (shown to the patient); the deposit is always refundable.
 * Returns the patch fields to merge into the appointment update, or null when the change is not a cancellation.
 */
export function clinicCancellationPatch(
  existing: { status: AppointmentStatus; bookingSource: BookingSource },
  nextStatus: AppointmentStatus | undefined,
  reason: string | null | undefined,
  now = new Date(),
): ClinicCancellationPatch | null {
  if (nextStatus !== AppointmentStatus.CANCELLED || existing.status === AppointmentStatus.CANCELLED) return null;
  const trimmed = (reason ?? "").trim().slice(0, CANCELLATION_REASON_MAX);
  const kiorex = isKiorexPatientBooking(existing.bookingSource);
  if (kiorex && trimmed.length < 3) {
    throw new BadRequestException({
      code: CANCELLATION_REASON_REQUIRED,
      message: "A cancellation reason is required for Kiorex bookings (it is shown to the patient).",
    });
  }
  return {
    cancelledAt: now,
    cancelledBy: "CLINIC",
    cancellationReason: trimmed || null,
    ...(kiorex ? { depositRefundable: true } : {}),
  };
}

/** Outbox payload extras so Kiorex can show the reason and refund the deposit. */
export function clinicCancellationEventMetadata(row: {
  externalReference: string | null;
  cancellationReason: string | null;
  depositRefundable: boolean | null;
}): Record<string, unknown> {
  return {
    externalReference: row.externalReference,
    cancelledBy: "CLINIC",
    cancellationReason: row.cancellationReason,
    depositRefundable: row.depositRefundable,
  };
}

export async function auditClinicCancellation(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  params: {
    tenantId: string;
    actorId: string | null;
    clinicId: string;
    appointmentId: string;
    patientId: string;
    bookingSource: BookingSource;
    reason: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorId: params.actorId,
      clinicId: params.clinicId,
      action: "appointment.cancelled_by_clinic",
      resource: "Appointment",
      resourceId: params.appointmentId,
      patientId: params.patientId,
      metadata: {
        bookingSource: params.bookingSource,
        reason: params.reason,
        depositRefundable: isKiorexPatientBooking(params.bookingSource) ? true : null,
      },
    },
  });
}
