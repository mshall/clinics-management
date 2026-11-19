import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newVisit, applyEvent, type FieldVisit } from "./lifecycle";
import {
  EGYPT_EMERGENCY_NUMBERS,
  SAFETY_ALERT_SLA_SECONDS,
  SAFETY_ANSWER_WINDOW_MIN,
  SAFETY_PROMPT_AFTER_MIN,
  answerSafetyPrompt,
  buildSafetyAlert,
  buildSos,
  deliverSafetyAlert,
  evaluateSafety,
} from "./safety";

const MIN = 60_000;
const END = Date.UTC(2026, 11, 1, 11);

function onSite(): FieldVisit {
  let v = newVisit({ id: "v1", plannedStartMs: END - 3_600_000, plannedEndMs: END, assignedClinicianId: "c1", nowMs: END - 7_200_000 });
  for (const e of [{ type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: { lat: 30.0444, lng: 31.2357, districtId: "maadi" } }] as const) {
    const r = applyEvent(v, e, END - 3_000_000);
    if (!r.ok) throw new Error(r.code);
    v = r.visit;
  }
  return v;
}

describe("safety timer protocol (HVSAF01)", () => {
  it("protocol constants: prompt after 30 min, 10 min to answer, 60 s alert SLA, 123/122", () => {
    assert.equal(SAFETY_PROMPT_AFTER_MIN, 30);
    assert.equal(SAFETY_ANSWER_WINDOW_MIN, 10);
    assert.equal(SAFETY_ALERT_SLA_SECONDS, 60);
    assert.deepEqual({ ...EGYPT_EMERGENCY_NUMBERS }, { ambulance: "123", police: "122" });
  });

  it("nothing before planned end + 30 min; prompt at +30; alert at +40 without an answer", () => {
    const v = onSite();
    assert.deepEqual(evaluateSafety(v, {}, END + 29 * MIN).actions, []);
    const p = evaluateSafety(v, {}, END + 30 * MIN);
    assert.deepEqual(p.actions.map((a) => a.type), ["PROMPT_CLINICIAN"]);
    assert.equal(p.actions[0]!.dueAtMs, END + 30 * MIN);
    assert.deepEqual(evaluateSafety(v, p.state, END + 39 * MIN).actions, []);
    const a = evaluateSafety(v, p.state, END + 40 * MIN);
    assert.deepEqual(a.actions.map((x) => x.type), ["ALERT_SAFETY_CONTACT"]);
    assert.equal(a.actions[0]!.dueAtMs, END + 40 * MIN);
  });

  it("each action fires once (idempotent when the state is passed back)", () => {
    const v = onSite();
    const p = evaluateSafety(v, {}, END + 31 * MIN);
    assert.equal(evaluateSafety(v, p.state, END + 32 * MIN).actions.length, 0);
    const a = evaluateSafety(v, p.state, END + 41 * MIN);
    assert.equal(evaluateSafety(v, a.state, END + 60 * MIN).actions.length, 0);
  });

  it("answering the prompt cancels the pending alert and re-arms for another 30 min", () => {
    const v = onSite();
    const p = evaluateSafety(v, {}, END + 30 * MIN);
    const answered = answerSafetyPrompt(p.state, END + 35 * MIN);
    assert.equal(evaluateSafety(v, answered, END + 41 * MIN).actions.length, 0, "no alert after an answer");
    const again = evaluateSafety(v, answered, END + 65 * MIN);
    assert.deepEqual(again.actions.map((x) => x.type), ["PROMPT_CLINICIAN"], "re-armed 30 min after the answer");
    const alert = evaluateSafety(v, again.state, END + 75 * MIN);
    assert.deepEqual(alert.actions.map((x) => x.type), ["ALERT_SAFETY_CONTACT"]);
  });

  it("applies only while in the field (on my way / arrived), never before departure or after the visit ends", () => {
    const v = onSite();
    for (const state of ["REQUESTED", "CONFIRMED", "FINISHED", "ABORTED_UNSAFE", "CANCELLED", "NO_SHOW"] as const) {
      assert.deepEqual(evaluateSafety({ ...v, state }, {}, END + 5 * 60 * MIN).actions, [], state);
    }
    assert.equal(evaluateSafety({ ...v, state: "ON_MY_WAY" }, {}, END + 31 * MIN).actions.length, 1);
  });

  it("a late tick still reports the alert as due 40 min after planned end (lateness never delays the protocol)", () => {
    const v = onSite();
    const late = evaluateSafety(v, {}, END + 2 * 60 * MIN);
    assert.deepEqual(late.actions.map((a) => a.type), ["PROMPT_CLINICIAN", "ALERT_SAFETY_CONTACT"]);
    assert.equal(late.actions[1]!.dueAtMs, END + 40 * MIN);
  });
});

describe("alerts and SOS (HVSAF02)", () => {
  it("SOS carries live location for the safety contact and shows 123 / 122; no patient data", () => {
    const v = onSite();
    const { alert, show } = buildSos({ visit: v, contactId: "contact-1", nowMs: END, liveLocation: { lat: 30.044421, lng: 31.235712 } });
    assert.deepEqual(show, { ambulance: "123", police: "122" });
    assert.deepEqual(alert.liveLocation, { lat: 30.044421, lng: 31.235712 });
    assert.equal(alert.kind, "SOS");
    assert.deepEqual(alert.lastGeostamp, { lat: 30.04, lng: 31.24, districtId: "maadi" });
    const json = JSON.stringify(alert).toLowerCase();
    for (const banned of ["address", "patient", "phone", "name"]) assert.equal(json.includes(banned), false, banned);
  });

  it("a no-answer alert never carries precise location, only the coarse last geostamp", () => {
    const alert = buildSafetyAlert({ kind: "NO_ANSWER", visit: onSite(), contactId: "c", nowMs: END, liveLocation: { lat: 30.044421, lng: 31.235712 } });
    assert.equal(alert.liveLocation, undefined);
    assert.deepEqual(alert.lastGeostamp, { lat: 30.04, lng: 31.24, districtId: "maadi" });
  });

  it("an alert without a safety contact cannot be built (the org must have one)", () => {
    assert.throws(() => buildSafetyAlert({ kind: "SOS", visit: onSite(), contactId: "", nowMs: END }), /SAFETY_CONTACT_REQUIRED/);
  });

  it("market-specific emergency numbers can be supplied", () => {
    const { show } = buildSos({ visit: onSite(), contactId: "c", nowMs: END, liveLocation: { lat: 1, lng: 1 }, emergencyNumbers: { ambulance: "997", police: "999" } });
    assert.deepEqual(show, { ambulance: "997", police: "999" });
  });
});

describe("deliverSafetyAlert", () => {
  const alert = () => buildSafetyAlert({ kind: "NO_ANSWER", visit: onSite(), contactId: "c", nowMs: END });
  it("reports the first confirmed delivery and its latency against the SLA", async () => {
    const r = await deliverSafetyAlert(alert(), [{ channel: "SMS", dispatch: async () => ({ deliveredAtMs: END + 5_000, channel: "SMS" }) }], END, () => END + 5_000);
    assert.deepEqual([r.delivered, r.latencyMs, r.withinSla], [true, 5_000, true]);
  });
  it("never throws when every channel fails; reports delivered:false", async () => {
    const boom = { channel: "SMS", dispatch: async () => { throw new Error("gateway down"); } };
    const r = await deliverSafetyAlert(alert(), [boom, { ...boom, channel: "WHATSAPP" }], END, () => END + 90_000);
    assert.deepEqual([r.delivered, r.withinSla, r.attempts.length], [false, false, 2]);
    assert.match(r.attempts[0]!.error!, /gateway down/);
  });
  it("no dispatchers at all is a failure, not a silent success", async () => {
    const r = await deliverSafetyAlert(alert(), [], END, () => END + 1);
    assert.equal(r.delivered, false);
  });
});
