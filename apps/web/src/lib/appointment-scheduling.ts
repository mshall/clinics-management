import type { AppointmentDto } from "@/lib/api-types";

export const APPOINTMENT_MIN_START_HOUR = 9;
export const APPOINTMENT_SLOT_MINUTES = 15;

const ACTIVE_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "CHECKED_IN"]);

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function effectiveAppointmentEnd(a: Pick<AppointmentDto, "startsAt" | "endsAt">): Date {
  if (a.endsAt) return new Date(a.endsAt);
  return addMinutes(new Date(a.startsAt), APPOINTMENT_SLOT_MINUTES);
}

export function roundUpToSlotMinutes(date: Date, slotMinutes = APPOINTMENT_SLOT_MINUTES): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const remainder = mins % slotMinutes;
  if (remainder !== 0) d.setMinutes(mins + (slotMinutes - remainder));
  return d;
}

export function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value.trim()) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date: date ?? "", time: time.slice(0, 5) };
}

export function composeDatetimeLocal(date: string, time: string): string {
  if (!date.trim()) return "";
  return `${date}T${time || "09:00"}`;
}

export function formatDatetimeLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function isStartBeforeMinHour(localDatetime: string, minHour = APPOINTMENT_MIN_START_HOUR): boolean {
  const { time } = splitDatetimeLocal(localDatetime);
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  return h < minHour || (h === minHour && m < 0);
}

export function suggestNextAppointmentStart(
  appointments: AppointmentDto[],
  dateIso: string,
  clinicianId: string,
): string {
  const base = new Date(`${dateIso}T${String(APPOINTMENT_MIN_START_HOUR).padStart(2, "0")}:00`);
  let next = base;
  for (const apt of appointments) {
    if (apt.clinicianId !== clinicianId || !ACTIVE_STATUSES.has(apt.status)) continue;
    const start = new Date(apt.startsAt);
    if (start.toDateString() !== base.toDateString()) continue;
    const end = effectiveAppointmentEnd(apt);
    if (end > next) next = roundUpToSlotMinutes(end);
  }
  return formatDatetimeLocal(next);
}

export function appointmentIntervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function formatAppointmentTimeRange(
  startsAt: string,
  endsAt: string | null | undefined,
  locale: string,
): string {
  const loc = locale;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : effectiveAppointmentEnd({ startsAt, endsAt: endsAt ?? null });
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString(loc, opts)} – ${end.toLocaleTimeString(loc, opts)}`;
}
