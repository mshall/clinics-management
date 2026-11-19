/** Pure KPI math for RP-01 — tests reconcile against raw appointment rows. */

export type OpsAppointmentRow = {
  id: string;
  status: string;
  clinicianId: string | null;
  appointmentTypeId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  bookingSource: string;
  isNewPatientAtBooking: boolean | null;
  durationMinutes?: number | null;
};

export type AvailabilityBlock = {
  clinicianId: string;
  start: Date;
  end: Date;
};

export function appointmentMinutes(row: OpsAppointmentRow): number {
  if (row.durationMinutes != null && row.durationMinutes > 0) return row.durationMinutes;
  if (row.endsAt) return Math.max(1, Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000));
  return 30;
}

export function noShowRate(rows: OpsAppointmentRow[]): { total: number; noShows: number; rate: number } {
  const countable = rows.filter((r) =>
    ["COMPLETED", "NO_SHOW", "CHECKED_IN", "IN_EXAM", "CONFIRMED"].includes(r.status) ||
    r.status === "NO_SHOW",
  );
  // Denominator: completed + no-show (arrived outcomes).
  const outcomes = rows.filter((r) => r.status === "COMPLETED" || r.status === "NO_SHOW");
  const noShows = outcomes.filter((r) => r.status === "NO_SHOW").length;
  const total = outcomes.length;
  return { total, noShows, rate: total === 0 ? 0 : Math.round((noShows / total) * 1000) / 10 };
}

export function noShowRateByDoctor(rows: OpsAppointmentRow[]): Array<{ clinicianId: string; total: number; noShows: number; rate: number }> {
  const by = new Map<string, OpsAppointmentRow[]>();
  for (const r of rows) {
    if (!r.clinicianId) continue;
    const list = by.get(r.clinicianId) ?? [];
    list.push(r);
    by.set(r.clinicianId, list);
  }
  return [...by.entries()].map(([clinicianId, list]) => ({ clinicianId, ...noShowRate(list) }));
}

export function noShowRateByType(rows: OpsAppointmentRow[]): Array<{ appointmentTypeId: string; total: number; noShows: number; rate: number }> {
  const by = new Map<string, OpsAppointmentRow[]>();
  for (const r of rows) {
    const key = r.appointmentTypeId ?? "unknown";
    const list = by.get(key) ?? [];
    list.push(r);
    by.set(key, list);
  }
  return [...by.entries()].map(([appointmentTypeId, list]) => ({ appointmentTypeId, ...noShowRate(list) }));
}

export function noShowRateByDay(rows: OpsAppointmentRow[]): Array<{ day: string; total: number; noShows: number; rate: number }> {
  const by = new Map<string, OpsAppointmentRow[]>();
  for (const r of rows) {
    const day = r.startsAt.toISOString().slice(0, 10);
    const list = by.get(day) ?? [];
    list.push(r);
    by.set(day, list);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, ...noShowRate(list) }));
}

export function utilisationPercent(bookedMinutes: number, availableMinutes: number): number {
  if (availableMinutes <= 0) return 0;
  return Math.round((bookedMinutes / availableMinutes) * 1000) / 10;
}

export function availableMinutesFromBlocks(blocks: AvailabilityBlock[]): number {
  return blocks.reduce((n, b) => n + Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60_000)), 0);
}

export function bookedMinutes(rows: OpsAppointmentRow[]): number {
  return rows
    .filter((r) => !["CANCELLED", "NO_SHOW"].includes(r.status))
    .reduce((n, r) => n + appointmentMinutes(r), 0);
}

export function revenuePerDoctorHour(revenue: number, bookedMinutesValue: number): number {
  if (bookedMinutesValue <= 0) return 0;
  return Math.round((revenue / (bookedMinutesValue / 60)) * 100) / 100;
}

export function newVsReturning(rows: OpsAppointmentRow[]): { newPatients: number; returning: number } {
  let newPatients = 0;
  let returning = 0;
  for (const r of rows) {
    if (r.isNewPatientAtBooking === true) newPatients += 1;
    else if (r.isNewPatientAtBooking === false) returning += 1;
  }
  return { newPatients, returning };
}

export function bookingSourceMix(rows: OpsAppointmentRow[]): Array<{ source: string; count: number; sharePercent: number }> {
  const by = new Map<string, number>();
  for (const r of rows) {
    by.set(r.bookingSource, (by.get(r.bookingSource) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({
      source,
      count,
      sharePercent: Math.round((count / total) * 1000) / 10,
    }));
}
