import { ACTIVE_FIELD_STATES, type FieldVisit } from "./lifecycle";
import type { Geostamp } from "./geostamp";
import type { DispatchReceipt, SafetyAlertDispatcher } from "./ports";

/**
 * Safety timer and SOS (HVSAF01/02, ADR-025). These are SAFETY CONTROLS, never switchable: this module takes no
 * configuration that disables or lengthens them, reads no feature flags and has no "off" mode. The constants are the
 * protocol (CMO-signed protocol GHV2 may tighten them via a package release, never loosen them per tenant).
 */
export const SAFETY_PROMPT_AFTER_MIN = 30;
export const SAFETY_ANSWER_WINDOW_MIN = 10;
/** A safety alert must reach the safety contact within 60 s of becoming due (KX-23 stop-ship condition). */
export const SAFETY_ALERT_SLA_SECONDS = 60;
/** Egypt emergency numbers; a market pack may supply others at the call site. */
export const EGYPT_EMERGENCY_NUMBERS = Object.freeze({ ambulance: "123", police: "122" });

const MIN = 60_000;

export type SafetyState = {
  promptSentAtMs?: number;
  /** Clinician answered the prompt "I'm OK" at this time; the timer restarts from it. */
  answeredAtMs?: number;
  alertSentAtMs?: number;
};

export type SafetyAction =
  | { type: "PROMPT_CLINICIAN"; visitId: string; dueAtMs: number }
  | { type: "ALERT_SAFETY_CONTACT"; visitId: string; dueAtMs: number; reason: "NO_ANSWER" };

export type SafetyEvaluation = { actions: SafetyAction[]; state: SafetyState };

/**
 * HVSAF01: no "Finished" 30 min after the planned end -> prompt the clinician; no answer within 10 min -> alert the org
 * safety contact. Idempotent: pass back the returned `state` and each action fires once. An "I'm OK" answer re-arms the
 * timer for another 30 min (the clinician is still on site). Only applies while the clinician is in the field.
 */
export function evaluateSafety(visit: Pick<FieldVisit, "id" | "state" | "plannedEndMs">, state: SafetyState, nowMs: number): SafetyEvaluation {
  if (!ACTIVE_FIELD_STATES.includes(visit.state)) return { actions: [], state };
  const base = Math.max(visit.plannedEndMs, state.answeredAtMs ?? 0);
  const promptDue = base + SAFETY_PROMPT_AFTER_MIN * MIN;
  const actions: SafetyAction[] = [];
  let next = { ...state };

  // A fresh answer after the last prompt re-arms: forget the previous prompt.
  if (state.answeredAtMs != null && state.promptSentAtMs != null && state.answeredAtMs >= state.promptSentAtMs) {
    next = { answeredAtMs: state.answeredAtMs };
  }
  if (next.promptSentAtMs == null && nowMs >= promptDue) {
    actions.push({ type: "PROMPT_CLINICIAN", visitId: visit.id, dueAtMs: promptDue });
    next = { ...next, promptSentAtMs: nowMs };
  }
  if (next.promptSentAtMs != null && next.alertSentAtMs == null) {
    const answered = state.answeredAtMs != null && state.answeredAtMs >= next.promptSentAtMs;
    // the alert is due 10 min after the prompt was DUE (not after it was processed), so a late tick cannot delay it
    const alertDue = Math.min(next.promptSentAtMs, promptDue) + SAFETY_ANSWER_WINDOW_MIN * MIN;
    if (!answered && nowMs >= alertDue) {
      actions.push({ type: "ALERT_SAFETY_CONTACT", visitId: visit.id, dueAtMs: alertDue, reason: "NO_ANSWER" });
      next = { ...next, alertSentAtMs: nowMs };
    }
  }
  return { actions, state: next };
}

/** Clinician answers the prompt ("I'm OK"). Never extends beyond one more 30 min period; HELP is an SOS. */
export function answerSafetyPrompt(state: SafetyState, nowMs: number): SafetyState {
  return { ...state, answeredAtMs: nowMs };
}

export type SafetyAlert = {
  kind: "NO_ANSWER" | "SOS";
  visitId: string;
  raisedAtMs: number;
  contactId: string;
  /** Coarse last known position. Only an SOS may carry precise live location. */
  lastGeostamp?: Geostamp;
  liveLocation?: { lat: number; lng: number };
  emergencyNumbers: { ambulance: string; police: string };
};

export function buildSafetyAlert(input: {
  kind: SafetyAlert["kind"];
  visit: Pick<FieldVisit, "id" | "history">;
  contactId: string;
  nowMs: number;
  liveLocation?: { lat: number; lng: number };
  emergencyNumbers?: { ambulance: string; police: string };
}): SafetyAlert {
  if (!input.contactId) throw new Error("SAFETY_CONTACT_REQUIRED");
  const last = [...input.visit.history].reverse().find((h) => h.geostamp)?.geostamp;
  return {
    kind: input.kind,
    visitId: input.visit.id,
    raisedAtMs: input.nowMs,
    contactId: input.contactId,
    ...(last ? { lastGeostamp: last } : {}),
    ...(input.kind === "SOS" && input.liveLocation ? { liveLocation: input.liveLocation } : {}),
    emergencyNumbers: input.emergencyNumbers ?? { ...EGYPT_EMERGENCY_NUMBERS },
  };
}

/** HVSAF02 — one-tap SOS: alert with live location for the safety contact and the numbers to show on screen (123 / 122). */
export function buildSos(input: {
  visit: Pick<FieldVisit, "id" | "history">;
  contactId: string;
  nowMs: number;
  liveLocation: { lat: number; lng: number };
  emergencyNumbers?: { ambulance: string; police: string };
}): { alert: SafetyAlert; show: { ambulance: string; police: string } } {
  const alert = buildSafetyAlert({ kind: "SOS", ...input });
  return { alert, show: alert.emergencyNumbers };
}

export type DeliveryResult = {
  delivered: boolean;
  receipt?: DispatchReceipt;
  attempts: { channel: string; ok: boolean; error?: string }[];
  /** ms from the moment the alert became due to confirmed delivery (or to giving up). */
  latencyMs: number;
  withinSla: boolean;
};

/**
 * Delivers an alert through the dispatchers in order (primary first, then fallbacks) until one confirms. Never throws:
 * failure is reported so the host can page on-call (`delivered: false` is itself an incident). `dueAtMs` is when the alert
 * became due; latency is measured from there against the 60 s SLA.
 */
export async function deliverSafetyAlert(
  alert: SafetyAlert,
  dispatchers: readonly SafetyAlertDispatcher[],
  dueAtMs: number,
  nowMs: () => number,
): Promise<DeliveryResult> {
  const attempts: DeliveryResult["attempts"] = [];
  for (const d of dispatchers) {
    try {
      const receipt = await d.dispatch(alert);
      attempts.push({ channel: String(d.channel), ok: true });
      const latencyMs = Math.max(0, receipt.deliveredAtMs - dueAtMs);
      return { delivered: true, receipt, attempts, latencyMs, withinSla: latencyMs <= SAFETY_ALERT_SLA_SECONDS * 1000 };
    } catch (e) {
      attempts.push({ channel: String(d.channel), ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const latencyMs = Math.max(0, nowMs() - dueAtMs);
  return { delivered: false, attempts, latencyMs, withinSla: false };
}
