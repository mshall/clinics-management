import type { TravelMatrix } from "./ports";

const MIN = 60_000;

/** HVCFG01 — default travel buffer before/after every home visit (30/30 minutes). */
export const DEFAULT_TRAVEL_BUFFERS = Object.freeze({ beforeMinutes: 30, afterMinutes: 30 });

export type TravelBuffers = { beforeMinutes: number; afterMinutes: number };

export type PlannedVisit = {
  id?: string;
  clinicianId?: string;
  startMs: number;
  endMs: number;
  districtId?: string;
  /** Per-visit-type buffer override (HVCFG01); falls back to the default. */
  buffers?: TravelBuffers;
};

export type BookingCheck = { ok: true } | { ok: false; reason: "INVALID_INTERVAL" | "OVERLAP" | "DAILY_CAP" | "TRAVEL_INFEASIBLE" };

export type BookingOptions = {
  defaultBuffers?: TravelBuffers;
  /** HVCFG03 daily home-visit cap per clinician (counted per `dayKey`). */
  dailyCap?: number | null;
  /** Maps an instant to a day bucket in the clinic's timezone. Default: UTC date. */
  dayKey?: (ms: number) => string;
  /** When given, the gap between two visits in different districts must cover the district-to-district travel time. */
  matrix?: TravelMatrix;
};

function buffersOf(v: PlannedVisit, d: TravelBuffers): TravelBuffers {
  return v.buffers ?? d;
}

/** The time a booked visit blocks on the calendar: its own interval plus travel before and after (HVBK01). */
export function blockedInterval(v: PlannedVisit, defaults: TravelBuffers = DEFAULT_TRAVEL_BUFFERS): { startMs: number; endMs: number } {
  const b = buffersOf(v, defaults);
  return { startMs: v.startMs - b.beforeMinutes * MIN, endMs: v.endMs + b.afterMinutes * MIN };
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * HVBK01 / HVCFG03 — can `candidate` be booked next to `existing` (same clinician) without breaking buffers, the daily cap
 * or (when a travel matrix is supplied) real travel time? Pure; the host passes the clinician's visits for the day.
 */
export function canBook(candidate: PlannedVisit, existing: readonly PlannedVisit[], opts: BookingOptions = {}): BookingCheck {
  const defaults = opts.defaultBuffers ?? DEFAULT_TRAVEL_BUFFERS;
  if (!(candidate.endMs > candidate.startMs)) return { ok: false, reason: "INVALID_INTERVAL" };
  const dayKey = opts.dayKey ?? utcDay;
  if (opts.dailyCap != null) {
    const sameDay = existing.filter((e) => dayKey(e.startMs) === dayKey(candidate.startMs)).length;
    if (sameDay >= opts.dailyCap) return { ok: false, reason: "DAILY_CAP" };
  }
  const cBlock = blockedInterval(candidate, defaults);
  for (const e of existing) {
    const eBlock = blockedInterval(e, defaults);
    if (cBlock.startMs < eBlock.endMs && eBlock.startMs < cBlock.endMs) return { ok: false, reason: "OVERLAP" };
  }
  if (opts.matrix && candidate.districtId) {
    for (const e of existing) {
      if (!e.districtId) continue;
      const first = e.endMs <= candidate.startMs ? e : candidate;
      const second = first === e ? candidate : e;
      const travel = opts.matrix.minutes(first.districtId!, second.districtId!);
      if (travel == null) return { ok: false, reason: "TRAVEL_INFEASIBLE" };
      if (second.startMs - first.endMs < travel * MIN) return { ok: false, reason: "TRAVEL_INFEASIBLE" };
    }
  }
  return { ok: true };
}

/** Filters candidate slots to those bookable next to the clinician's existing visits. */
export function filterBookableSlots(slots: readonly PlannedVisit[], existing: readonly PlannedVisit[], opts: BookingOptions = {}): PlannedVisit[] {
  return slots.filter((s) => canBook(s, existing, opts).ok);
}

/** "Today" route: visits in time order (HVEXE01). Stable for equal start times. */
export function orderRoute<T extends PlannedVisit>(visits: readonly T[]): T[] {
  return visits.map((v, i) => ({ v, i })).sort((a, b) => a.v.startMs - b.v.startMs || a.i - b.i).map((x) => x.v);
}

export type RouteLeg = { fromId?: string; toId?: string; travelMinutes: number | null; gapMinutes: number; feasible: boolean };

/** Travel legs between consecutive visits with the slack left after travel. `feasible` is false when travel is unknown or exceeds the gap. */
export function routeLegs(visits: readonly PlannedVisit[], matrix: TravelMatrix): RouteLeg[] {
  const ordered = orderRoute(visits);
  const legs: RouteLeg[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1]!;
    const b = ordered[i]!;
    const travel = a.districtId && b.districtId ? matrix.minutes(a.districtId, b.districtId) : null;
    const gap = Math.floor((b.startMs - a.endMs) / MIN);
    legs.push({ fromId: a.id, toId: b.id, travelMinutes: travel, gapMinutes: gap, feasible: travel != null && gap >= travel });
  }
  return legs;
}
