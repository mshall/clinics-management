import { DateTime } from "luxon";

/** KNCP01 — one plan item: a service (home visit type) x frequency x duration. */
export type CarePlanItem = {
  appointmentTypeId: string;
  /** Every N days (1 = daily) — use this OR `frequencyPerWeek`. */
  everyDays?: number;
  frequencyPerWeek?: number;
  durationDays: number;
  /** Preferred clinic-local time "HH:mm". */
  timeOfDay: string;
};

export type PlannedVisitDate = { date: string; appointmentTypeId: string; timeOfDay: string };

const MAX_VISITS = 120;

/** Calendar of wanted visits (YYYY-MM-DD, clinic-local), ordered. e.g. dressing daily x 14 days = 14 dates. Pure. */
export function planVisitDates(items: CarePlanItem[], startDate: string, zone: string): PlannedVisitDate[] {
  const start = DateTime.fromISO(startDate, { zone }).startOf("day");
  if (!start.isValid) throw new Error("Invalid startDate");
  const out: PlannedVisitDate[] = [];
  for (const it of items) {
    if (!Number.isInteger(it.durationDays) || it.durationDays < 1 || it.durationDays > 365) throw new Error("durationDays must be 1..365");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(it.timeOfDay)) throw new Error("timeOfDay must be HH:mm");
    const every = it.everyDays ?? (it.frequencyPerWeek ? Math.max(1, Math.round(7 / it.frequencyPerWeek)) : 1);
    if (!Number.isInteger(every) || every < 1 || every > 30) throw new Error("frequency must be 1..30 days apart");
    for (let d = 0; d < it.durationDays; d += every) out.push({ date: start.plus({ days: d }).toISODate()!, appointmentTypeId: it.appointmentTypeId, timeOfDay: it.timeOfDay });
  }
  if (out.length > MAX_VISITS) throw new Error(`A care plan may generate at most ${MAX_VISITS} visits`);
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.timeOfDay.localeCompare(b.timeOfDay));
}
