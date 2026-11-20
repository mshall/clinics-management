import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { applyEvent, buildSafetyAlert, buildSos, newVisit, type FieldVisit, type SafetyAlertDispatcher } from "@kiorly/field-visit";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { FIELD_VISIT_PORT, type FieldVisitPort } from "./field-visit.port";
import { FieldVisitService, districtsFromMarket } from "./field-visit.service";
import { MockSafetyAlertDispatcher, UnwiredRealSafetyAlertDispatcher } from "./mock-safety-alert.dispatcher";

const T0 = Date.UTC(2026, 11, 1, 9);

function onSiteVisit(): FieldVisit {
  let v = newVisit({ id: "hv-1", plannedStartMs: T0, plannedEndMs: T0 + 3_600_000, assignedClinicianId: "doc-1", nowMs: T0 - 1000 });
  for (const e of [{ type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: { lat: 30.0444, lng: 31.2357, districtId: "maadi" } }] as const) {
    const r = applyEvent(v, e, T0);
    if (!r.ok) throw new Error(r.code);
    v = r.visit;
  }
  return v;
}

describe("KCV206 API wiring: FieldVisitPort over @kiorly/field-visit", () => {
  const port: FieldVisitPort = new FieldVisitService([]);

  it("the package resolves from the workspace and the port token exists", () => {
    assert.equal(typeof FIELD_VISIT_PORT, "symbol");
    assert.equal(port.checkCoverage({ districtIds: ["maadi"] }, { districtId: "Maadi" }).inZone, true);
    assert.equal(port.checkCoverage({ districtIds: ["maadi"] }, { districtId: "zamalek" }).inZone, false);
  });

  it("booking, lifecycle and address privacy go through the port", () => {
    const a = { startMs: T0, endMs: T0 + 3_600_000 };
    assert.deepEqual(port.canBookHomeSlot({ startMs: T0 + 3_600_000, endMs: T0 + 7_200_000 }, [a]), { ok: false, reason: "OVERLAP" });
    const v = onSiteVisit();
    assert.equal(v.state, "ARRIVED");
    assert.equal(port.canViewAddress({ userId: "doc-1" }, v, T0), true);
    assert.equal(port.canViewAddress({ userId: "doc-2" }, v, T0), false, "an unassigned clinician never sees the address");
    assert.equal(port.applyVisitEvent(v, { type: "MARK_NO_SHOW" }, T0).ok, false);
    assert.deepEqual(port.evaluateSafetyTimer(v, {}, T0 + 3_600_000 + 31 * 60_000).actions.map((x) => x.type), ["PROMPT_CLINICIAN"]);
  });

  it("market-pack district lists are validated through the package", () => {
    assert.deepEqual(districtsFromMarket(null), []);
    assert.deepEqual(districtsFromMarket({ clinicalConfig: {} }), []);
    assert.equal(districtsFromMarket({ clinicalConfig: { districts: [{ id: "maadi", nameEn: "Maadi", nameAr: "المعادي" }] } }).length, 1);
    assert.throws(() => districtsFromMarket({ clinicalConfig: { districts: [{ id: "Maadi" }] } }));
  });
});

describe("mock safety-alert delivery (MODE=mock)", () => {
  it("writes an SMS to the dev inbox with no patient data or address and reports delivery", async () => {
    const recorded: { bodyText: string; toAddress: string; templateKey?: string | null }[] = [];
    const orig = DevInboxRecorder.record;
    DevInboxRecorder.record = (async (i: never) => {
      recorded.push(i);
      return "id";
    }) as never;
    try {
      const svc = new FieldVisitService([new MockSafetyAlertDispatcher("t1", "+201000000000", () => T0 + 4000)]);
      const { alert } = buildSos({ visit: onSiteVisit(), contactId: "c1", nowMs: T0, liveLocation: { lat: 30.04, lng: 31.23 } });
      const res = await svc.deliverSafetyAlert(alert, T0);
      assert.equal(res.delivered, true);
      assert.equal(res.withinSla, true);
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0]!.templateKey, "home_visit.sos");
      assert.match(recorded[0]!.bodyText, /123/);
      assert.doesNotMatch(recorded[0]!.bodyText.toLowerCase(), /patient|address/);
    } finally {
      DevInboxRecorder.record = orig;
    }
  });

  it("the real path fails closed until PG-13 wires a provider: undelivered, never a silent success", async () => {
    const svc = new FieldVisitService([new UnwiredRealSafetyAlertDispatcher()]);
    const alert = buildSafetyAlert({ kind: "NO_ANSWER", visit: onSiteVisit(), contactId: "c1", nowMs: T0 });
    const res = await svc.deliverSafetyAlert(alert, T0);
    assert.equal(res.delivered, false);
    assert.match(res.attempts[0]!.error!, /PG-13/);
  });

  it("dispatchers are an interface (a fallback channel takes over)", async () => {
    const bad: SafetyAlertDispatcher = { channel: "SMS", dispatch: async () => { throw new Error("down"); } };
    const good: SafetyAlertDispatcher = { channel: "WHATSAPP", dispatch: async () => ({ deliveredAtMs: Date.now(), channel: "WHATSAPP" }) };
    const svc = new FieldVisitService([bad, good]);
    const res = await svc.deliverSafetyAlert(buildSafetyAlert({ kind: "NO_ANSWER", visit: onSiteVisit(), contactId: "c1", nowMs: T0 }), Date.now());
    assert.deepEqual(res.attempts.map((a) => a.ok), [false, true]);
  });
});

describe("ADR-025 home-visit safety is never a flag (API side)", () => {
  it("field-visit sources do not use feature-flag gating", () => {
    for (const f of ["field-visit.port.ts", "field-visit.service.ts", "mock-safety-alert.dispatcher.ts"]) {
      const s = readFileSync(join(__dirname, f), "utf8");
      assert.ok(!/RequiresFeature\s*\(|FeatureGuard\b|FeatureFlagsService\b|isEnabled\s*\(/.test(s), f);
    }
  });
});
