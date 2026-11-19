import { coarsen, type Geostamp } from "./geostamp";

/**
 * Visit lifecycle (KX-05 §08 flow): Requested -> Confirmed (address confirmed) -> On my way -> Arrived (geostamp = check-in)
 * -> Finished (= complete). A clinician who feels unsafe ends the visit with "Leave visit - unsafe" (ABORTED_UNSAFE): never a
 * no-show (BR61). Pure state machine; the host persists the returned snapshot and emits its own outbox events.
 */
export type VisitState = "REQUESTED" | "CONFIRMED" | "ON_MY_WAY" | "ARRIVED" | "FINISHED" | "ABORTED_UNSAFE" | "CANCELLED" | "NO_SHOW";

export const TERMINAL_STATES: readonly VisitState[] = ["FINISHED", "ABORTED_UNSAFE", "CANCELLED", "NO_SHOW"];
/** States in which the clinician is out in the field (safety timer and SOS apply). */
export const ACTIVE_FIELD_STATES: readonly VisitState[] = ["ON_MY_WAY", "ARRIVED"];

export type VisitEvent =
  | { type: "CONFIRM"; addressConfirmed: boolean }
  | { type: "DEPART"; geostamp?: { lat: number; lng: number; districtId?: string } }
  | { type: "ARRIVE"; geostamp: { lat: number; lng: number; districtId?: string } }
  | { type: "FINISH"; geostamp?: { lat: number; lng: number; districtId?: string } }
  | { type: "ABORT_UNSAFE"; reason: string; geostamp?: { lat: number; lng: number; districtId?: string } }
  | { type: "CANCEL"; reason?: string }
  | { type: "MARK_NO_SHOW" };

export type HistoryEntry = { state: VisitState; atMs: number; geostamp?: Geostamp; reason?: string };

export type FieldVisit = {
  id: string;
  state: VisitState;
  plannedStartMs: number;
  plannedEndMs: number;
  assignedClinicianId?: string;
  history: HistoryEntry[];
  /** Set when the visit reaches a terminal state; drives address masking (24 h after). */
  endedAtMs?: number;
  abortReason?: string;
};

export type TransitionErrorCode = "ILLEGAL_TRANSITION" | "ADDRESS_NOT_CONFIRMED" | "GEOSTAMP_REQUIRED" | "REASON_REQUIRED" | "NO_SHOW_NOT_ALLOWED";

export type TransitionResult = { ok: true; visit: FieldVisit } | { ok: false; code: TransitionErrorCode };

export function newVisit(input: { id: string; plannedStartMs: number; plannedEndMs: number; assignedClinicianId?: string; nowMs: number }): FieldVisit {
  return {
    id: input.id,
    state: "REQUESTED",
    plannedStartMs: input.plannedStartMs,
    plannedEndMs: input.plannedEndMs,
    assignedClinicianId: input.assignedClinicianId,
    history: [{ state: "REQUESTED", atMs: input.nowMs }],
  };
}

const ALLOWED: Record<VisitEvent["type"], readonly VisitState[]> = {
  CONFIRM: ["REQUESTED"],
  DEPART: ["CONFIRMED"],
  ARRIVE: ["ON_MY_WAY"],
  FINISH: ["ARRIVED"],
  ABORT_UNSAFE: ["ON_MY_WAY", "ARRIVED"],
  CANCEL: ["REQUESTED", "CONFIRMED"],
  MARK_NO_SHOW: ["CONFIRMED", "ON_MY_WAY"],
};

const NEXT: Record<VisitEvent["type"], VisitState> = {
  CONFIRM: "CONFIRMED",
  DEPART: "ON_MY_WAY",
  ARRIVE: "ARRIVED",
  FINISH: "FINISHED",
  ABORT_UNSAFE: "ABORTED_UNSAFE",
  CANCEL: "CANCELLED",
  MARK_NO_SHOW: "NO_SHOW",
};

/** Whether the visit can still be marked a no-show. Never after an unsafe abort (BR61) or once the clinician arrived. */
export function noShowAllowed(v: FieldVisit): boolean {
  return v.state === "CONFIRMED" || v.state === "ON_MY_WAY";
}

export function applyEvent(visit: FieldVisit, event: VisitEvent, nowMs: number): TransitionResult {
  if (visit.state === "ABORTED_UNSAFE" && event.type === "MARK_NO_SHOW") return { ok: false, code: "NO_SHOW_NOT_ALLOWED" };
  if (!ALLOWED[event.type].includes(visit.state)) return { ok: false, code: "ILLEGAL_TRANSITION" };
  if (event.type === "CONFIRM" && !event.addressConfirmed) return { ok: false, code: "ADDRESS_NOT_CONFIRMED" };
  if (event.type === "ARRIVE" && !event.geostamp) return { ok: false, code: "GEOSTAMP_REQUIRED" };
  if (event.type === "ABORT_UNSAFE" && !event.reason?.trim()) return { ok: false, code: "REASON_REQUIRED" };

  const next = NEXT[event.type];
  const raw = "geostamp" in event ? event.geostamp : undefined;
  const geostamp = raw ? coarsen(raw.lat, raw.lng, raw.districtId) : undefined;
  const reason = event.type === "ABORT_UNSAFE" ? event.reason.trim() : event.type === "CANCEL" ? event.reason?.trim() : undefined;
  const entry: HistoryEntry = { state: next, atMs: nowMs, ...(geostamp ? { geostamp } : {}), ...(reason ? { reason } : {}) };
  const terminal = TERMINAL_STATES.includes(next);
  return {
    ok: true,
    visit: {
      ...visit,
      state: next,
      history: [...visit.history, entry],
      ...(terminal ? { endedAtMs: nowMs } : {}),
      ...(event.type === "ABORT_UNSAFE" ? { abortReason: reason } : {}),
    },
  };
}

/** HVEXE02 — "Arrived" is the check-in for attendance/commission; "Finished" is the complete. */
export function isCheckedIn(v: FieldVisit): boolean {
  return v.history.some((h) => h.state === "ARRIVED");
}
export function isCompleted(v: FieldVisit): boolean {
  return v.state === "FINISHED";
}
