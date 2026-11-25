import assert from "node:assert/strict";
import { test } from "node:test";
import { CLINIC_POLICY, policyNumber } from "./clinic-policy";
import { JOIN_CLOSES_AFTER_END_MS, JOIN_OPENS_BEFORE_MS, joinWindow } from "../telehealth/telehealth-window";

test("defaults equal the numbers that shipped", () => {
  assert.equal(policyNumber("slotHoldMinutes", {}), 5);
  assert.equal(policyNumber("telehealthJoinOpensBeforeMinutes", {}), 10);
  assert.equal(policyNumber("telehealthJoinClosesAfterEndMinutes", {}), 60);
  assert.equal(JOIN_OPENS_BEFORE_MS, 600_000); assert.equal(JOIN_CLOSES_AFTER_END_MS, 3_600_000);
});
test("an env value inside the range applies; outside the range, junk or fractional falls back to the default", () => {
  assert.equal(policyNumber("slotHoldMinutes", { CLINIC_SLOT_HOLD_MINUTES: "8" }), 8);
  for (const bad of ["1", "16", "abc", "5.5", "-3", "0"]) assert.equal(policyNumber("slotHoldMinutes", { CLINIC_SLOT_HOLD_MINUTES: bad }), 5, bad);
  assert.equal(policyNumber("telehealthJoinOpensBeforeMinutes", { CLINIC_TELEHEALTH_JOIN_OPENS_BEFORE_MINUTES: "2" }), 10);
});
test("the telehealth join window follows the setting", () => {
  const s = new Date("2026-12-01T10:00:00Z"); const e = new Date("2026-12-01T10:30:00Z");
  const was = { ...process.env };
  try {
    assert.equal(joinWindow(s, e).opensAt.toISOString(), "2026-12-01T09:50:00.000Z");
    process.env.CLINIC_TELEHEALTH_JOIN_OPENS_BEFORE_MINUTES = "15"; process.env.CLINIC_TELEHEALTH_JOIN_CLOSES_AFTER_END_MINUTES = "30";
    const w = joinWindow(s, e); assert.equal(w.opensAt.toISOString(), "2026-12-01T09:45:00.000Z"); assert.equal(w.closesAt.toISOString(), "2026-12-01T11:00:00.000Z");
  } finally { delete process.env.CLINIC_TELEHEALTH_JOIN_OPENS_BEFORE_MINUTES; delete process.env.CLINIC_TELEHEALTH_JOIN_CLOSES_AFTER_END_MINUTES; Object.assign(process.env, was); }
});
test("every spec default sits inside its own bounds", () => { for (const s of Object.values(CLINIC_POLICY)) assert.ok(s.def >= s.min && s.def <= s.max); });
