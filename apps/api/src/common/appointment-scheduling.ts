import { AppointmentStatus } from "@prisma/client";

export const APPOINTMENT_MIN_START_HOUR = 9;
export const APPOINTMENT_SLOT_MINUTES = 15;

export const ACTIVE_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
]);

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function effectiveAppointmentEnd(startsAt: Date, endsAt: Date | null | undefined): Date {
  if (endsAt) return endsAt;
  return addMinutes(startsAt, APPOINTMENT_SLOT_MINUTES);
}

/** Intervals overlap when [aStart, aEnd) and [bStart, bEnd) intersect. */
export function appointmentIntervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function resolveCreateAppointmentEnd(start: Date, endsAtRaw?: string | null): Date {
  const trimmed = endsAtRaw?.trim();
  if (trimmed) {
    const end = new Date(trimmed);
    if (Number.isNaN(end.getTime()) || end <= start) {
      throw new Error("endsAt must be after startsAt");
    }
    return end;
  }
  return addMinutes(start, APPOINTMENT_SLOT_MINUTES);
}
