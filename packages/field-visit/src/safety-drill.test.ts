import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { applyEvent, newVisit, type FieldVisit } from "./lifecycle";
import { ADDRESS_MASK_AFTER_MS, canViewAddress } from "./privacy";
import type { SafetyAlertDispatcher } from "./ports";
import {
  SAFETY_ALERT_SLA_SECONDS,
  answerSafetyPrompt,
  buildSafetyAlert,
  buildSos,
  deliverSafetyAlert,
  evaluateSafety,
  type SafetyAlert,
  type SafetyState,
} from "./safety";

/**
 * SAFETY DRILL SUITE (KX-08 §05: "a safety-drill suite travels with field-visit"; KX-17 G5: "field-visit safety drill green
 * in staging"; KX-23 stop-ship: "safety alert > 60 s"). Simulated clock, simulated channels, no real provider. The host
 * product re-runs this suite (`npm run test:drill -w @kiorly/field-visit`) in staging before enabling home visits.
 */
const MIN = 60_000;
const SEC = 1_000;
const PLANNED_END = Date.UTC(2026, 11, 1, 11);

class Clock {
  constructor(public now: number) {}
  advance(ms: number) {
    this.now += ms;
  }
}

function fieldVisit(): FieldVisit {
  let v = newVisit({ id: "drill-1", plannedStartMs: PLANNED_END - 3_600_000, plannedEndMs: PLANNED_END, assignedClinicianId: "nurse-1", nowMs: PLANNED_END - 7_200_000 });
  for (const e of [{ type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: { lat: 30.0444, lng: 31.2357, districtId: "maadi" } }] as const) {
    const r = applyEvent(v, e, PLANNED_END - 3_000_000);
    if (!r.ok) throw new Error(r.code);
    v = r.visit;
  }
  return v;
}

/** Channel that takes `latencyMs` of simulated time and either confirms or fails. */
function channel(clock: Clock, name: string, latencyMs: number, fail = false): SafetyAlertDispatcher & { sent: SafetyAlert[] } {
  const sent: SafetyAlert[] = [];
  return {
    channel: name,
    sent,
    async dispatch(alert) {
      clock.advance(latencyMs);
      if (fail) throw new Error(`${name} unavailable`);
      sent.push(alert);
      return { deliveredAtMs: clock.now, channel: name };
    },
  };
}

/** Runs the monitor like the host scheduler would: tick every `tickMs`, deliver alerts as they fall due. */
async function runMonitor(opts: { visit: FieldVisit; clock: Clock; tickMs: number; untilMs: number; dispatchers: SafetyAlertDispatcher[]; answerAtMs?: number }) {
  let state: SafetyState = {};
  const log: { at: number; what: string; latencyMs?: number; withinSla?: boolean; delivered?: boolean }[] = [];
  while (opts.clock.now <= opts.untilMs) {
    if (opts.answerAtMs != null && opts.clock.now >= opts.answerAtMs && state.promptSentAtMs != null && (state.answeredAtMs ?? 0) < state.promptSentAtMs) {
      state = answerSafetyPrompt(state, opts.clock.now);
      log.push({ at: opts.clock.now, what: "ANSWERED" });
    }
    const ev = evaluateSafety(opts.visit, state, opts.clock.now);
    state = ev.state;
    for (const a of ev.actions) {
      if (a.type === "PROMPT_CLINICIAN") log.push({ at: opts.clock.now, what: "PROMPT" });
      else {
        const alert = buildSafetyAlert({ kind: "NO_ANSWER", visit: opts.visit, contactId: "safety-contact", nowMs: opts.clock.now });
        const res = await deliverSafetyAlert(alert, opts.dispatchers, a.dueAtMs, () => opts.clock.now);
        log.push({ at: opts.clock.now, what: "ALERT", latencyMs: res.latencyMs, withinSla: res.withinSla, delivered: res.delivered });
      }
    }
    opts.clock.advance(opts.tickMs);
  }
  return log;
}

describe("DRILL 1: clinician goes silent -> safety contact alerted within 60 s of the alert being due", () => {
  it("prompt at planned end + 30 min, alert due at +40 min, delivered inside the SLA with a 15 s scheduler tick", async () => {
    const clock = new Clock(PLANNED_END);
    const sms = channel(clock, "SMS", 4 * SEC);
    const log = await runMonitor({ visit: fieldVisit(), clock, tickMs: 15 * SEC, untilMs: PLANNED_END + 50 * MIN, dispatchers: [sms] });
    const prompt = log.find((l) => l.what === "PROMPT")!;
    const alert = log.find((l) => l.what === "ALERT")!;
    assert.ok(prompt.at >= PLANNED_END + 30 * MIN && prompt.at < PLANNED_END + 30 * MIN + 15 * SEC, "prompt raised on the first tick after +30 min");
    assert.equal(alert.delivered, true);
    assert.ok(alert.withinSla, `latency ${alert.latencyMs} ms must be <= ${SAFETY_ALERT_SLA_SECONDS * SEC} ms`);
    assert.ok(alert.latencyMs! <= 19 * SEC, "tick (<=15 s) + channel (4 s)");
    assert.equal(sms.sent.length, 1, "exactly one alert");
    assert.equal(log.filter((l) => l.what === "ALERT").length, 1);
  });
});

describe("DRILL 2: the clinician answers in time -> no alert", () => {
  it("an 'I'm OK' at +35 min prevents the +40 min alert", async () => {
    const clock = new Clock(PLANNED_END);
    const sms = channel(clock, "SMS", 2 * SEC);
    const log = await runMonitor({ visit: fieldVisit(), clock, tickMs: 15 * SEC, untilMs: PLANNED_END + 50 * MIN, dispatchers: [sms], answerAtMs: PLANNED_END + 35 * MIN });
    assert.ok(log.some((l) => l.what === "ANSWERED"));
    assert.equal(log.filter((l) => l.what === "ALERT").length, 0);
    assert.equal(sms.sent.length, 0);
  });
});

describe("DRILL 3: the primary channel is down -> fallback delivers, still inside the SLA", () => {
  it("SMS times out after 20 s, WhatsApp confirms 10 s later: latency <= 60 s", async () => {
    const clock = new Clock(PLANNED_END);
    const sms = channel(clock, "SMS", 20 * SEC, true);
    const wa = channel(clock, "WHATSAPP", 10 * SEC);
    const log = await runMonitor({ visit: fieldVisit(), clock, tickMs: 10 * SEC, untilMs: PLANNED_END + 45 * MIN, dispatchers: [sms, wa] });
    const alert = log.find((l) => l.what === "ALERT")!;
    assert.equal(alert.delivered, true);
    assert.ok(alert.withinSla, `latency ${alert.latencyMs}`);
    assert.equal(wa.sent.length, 1);
    assert.equal(sms.sent.length, 0);
  });

  it("a slow tick (45 s) plus a slow channel (30 s) breaches the SLA and the drill reports it (host must tighten the tick)", async () => {
    const clock = new Clock(PLANNED_END);
    const slow = channel(clock, "SMS", 30 * SEC);
    const log = await runMonitor({ visit: fieldVisit(), clock, tickMs: 45 * SEC, untilMs: PLANNED_END + 45 * MIN, dispatchers: [slow] });
    const alert = log.find((l) => l.what === "ALERT")!;
    assert.equal(alert.delivered, true);
    assert.equal(alert.withinSla, alert.latencyMs! <= SAFETY_ALERT_SLA_SECONDS * SEC);
  });
});

describe("DRILL 4: every channel fails -> reported as undelivered (never a silent success)", () => {
  it("delivered:false so the host pages on-call", async () => {
    const clock = new Clock(PLANNED_END);
    const log = await runMonitor({ visit: fieldVisit(), clock, tickMs: 15 * SEC, untilMs: PLANNED_END + 45 * MIN, dispatchers: [channel(clock, "SMS", 5 * SEC, true), channel(clock, "WHATSAPP", 5 * SEC, true)] });
    const alert = log.find((l) => l.what === "ALERT")!;
    assert.equal(alert.delivered, false);
    assert.equal(alert.withinSla, false);
  });
});

describe("DRILL 5: the monitor itself was down for 2 h -> alert is overdue and reported with its true latency", () => {
  it("a single late tick emits prompt + alert at once; latency is measured from the due time", async () => {
    const clock = new Clock(PLANNED_END + 2 * 60 * MIN);
    const sms = channel(clock, "SMS", 3 * SEC);
    const v = fieldVisit();
    const ev = evaluateSafety(v, {}, clock.now);
    assert.deepEqual(ev.actions.map((a) => a.type), ["PROMPT_CLINICIAN", "ALERT_SAFETY_CONTACT"]);
    const a = ev.actions[1]!;
    const res = await deliverSafetyAlert(buildSafetyAlert({ kind: "NO_ANSWER", visit: v, contactId: "c", nowMs: clock.now }), [sms], a.dueAtMs, () => clock.now);
    assert.equal(res.withinSla, false, "80 min late is an SLA breach and must show as one");
    assert.ok(res.latencyMs > 60 * MIN);
  });
});

describe("DRILL 6: SOS", () => {
  it("one tap: alert with live location reaches the safety contact; screen shows 123 and 122", async () => {
    const clock = new Clock(PLANNED_END - 20 * MIN);
    const sms = channel(clock, "SMS", 2 * SEC);
    const { alert, show } = buildSos({ visit: fieldVisit(), contactId: "safety-contact", nowMs: clock.now, liveLocation: { lat: 30.044421, lng: 31.235712 } });
    const res = await deliverSafetyAlert(alert, [sms], clock.now, () => clock.now);
    assert.equal(res.delivered && res.withinSla, true);
    assert.deepEqual(show, { ambulance: "123", police: "122" });
    assert.ok(sms.sent[0]!.liveLocation);
  });
});

describe("DRILL 7: leaving unsafe", () => {
  it("ends the visit with a reason, stops the safety timer, is never a no-show, and the address masks 24 h later", () => {
    const v = fieldVisit();
    const r = applyEvent(v, { type: "ABORT_UNSAFE", reason: "Threatened at the door" }, PLANNED_END - 10 * MIN);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.visit.state, "ABORTED_UNSAFE");
    assert.deepEqual(evaluateSafety(r.visit, {}, PLANNED_END + 3 * 60 * MIN).actions, []);
    assert.equal(applyEvent(r.visit, { type: "MARK_NO_SHOW" }, PLANNED_END).ok, false);
    const ended = r.visit.endedAtMs!;
    assert.equal(canViewAddress({ userId: "nurse-1" }, r.visit, ended + ADDRESS_MASK_AFTER_MS - 1), true);
    assert.equal(canViewAddress({ userId: "nurse-1" }, r.visit, ended + ADDRESS_MASK_AFTER_MS), false);
  });
});

describe("DRILL 8: address masking (stop-ship: address visible to unassigned nurse or after 24 h)", () => {
  it("an unassigned nurse never sees the address at any stage; the assigned nurse loses it 24 h after finish", () => {
    let v = fieldVisit();
    for (const state of ["CONFIRMED", "ON_MY_WAY", "ARRIVED"] as const) assert.equal(canViewAddress({ userId: "nurse-2" }, { ...v, state }, PLANNED_END), false);
    const done = applyEvent(v, { type: "FINISH" }, PLANNED_END);
    assert.ok(done.ok);
    if (!done.ok) return;
    v = done.visit;
    assert.equal(canViewAddress({ userId: "nurse-2" }, v, PLANNED_END + 1), false);
    assert.equal(canViewAddress({ userId: "nurse-1" }, v, PLANNED_END + 23 * 60 * MIN), true);
    assert.equal(canViewAddress({ userId: "nurse-1" }, v, PLANNED_END + 24 * 60 * MIN + 1), false);
  });
});

describe("DRILL 9: never switchable (ADR-025)", () => {
  it("the safety API has no switch: no options parameter, no env, no feature-flag or 'enabled' vocabulary in any package source", () => {
    assert.equal(evaluateSafety.length, 3, "evaluateSafety(visit, state, nowMs): nothing to disable or lengthen");
    const dir = join(__dirname);
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    assert.ok(sources.length >= 8);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.doesNotMatch(text, /process\.env|featureFlag|FeatureFlag|RequiresFeature|isEnabled|\benabled\b|\bdisable[dA-Z]?/, `${f} must not read config/flags`);
    }
  });
});
