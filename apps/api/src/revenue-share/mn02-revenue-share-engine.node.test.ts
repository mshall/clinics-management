import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStatement, currentPeriodKey, periodRange, pickLineRule, type ShareLine, type ShareRule } from "./revenue-share-engine";

const rule = (p: Partial<ShareRule>): ShareRule => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  clinicianId: null,
  clinicId: null,
  appointmentTypeId: null,
  revenueCategory: null,
  payerKey: null,
  ruleType: "PERCENT",
  percent: null,
  fixedAmount: null,
  roomRental: false,
  priority: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...p,
});

const line = (p: Partial<ShareLine>): ShareLine => ({
  id: Math.random().toString(36).slice(2),
  clinicianId: "doc",
  clinicId: "c1",
  appointmentTypeId: null,
  category: "VISIT_FEE",
  payerKey: "PATIENT",
  visitKey: "v1",
  gross: 100,
  net: 100,
  ...p,
});

describe("MN-02 revenue-share engine", () => {
  it("most specific rule wins; ties go to priority then newest", () => {
    const general = rule({ id: "general", percent: 30 });
    const doctor = rule({ id: "doctor", clinicianId: "doc", percent: 40 });
    const doctorType = rule({ id: "doctorType", clinicianId: "doc", appointmentTypeId: "t1", percent: 50 });
    const rules = [general, doctor, doctorType];
    assert.equal(pickLineRule(line({}), rules)?.id, "doctor");
    assert.equal(pickLineRule(line({ appointmentTypeId: "t1" }), rules)?.id, "doctorType");
    assert.equal(pickLineRule(line({ clinicianId: "other" }), rules)?.id, "general");
    const hi = rule({ id: "hi", clinicianId: "doc", percent: 10, priority: 5 });
    assert.equal(pickLineRule(line({}), [doctor, hi])?.id, "hi");
    const newer = rule({ id: "newer", clinicianId: "doc", percent: 20, createdAt: new Date("2026-02-01T00:00:00Z") });
    assert.equal(pickLineRule(line({}), [doctor, newer])?.id, "newer");
    assert.equal(pickLineRule(line({ payerKey: "PATIENT" }), [rule({ id: "kx", payerKey: "KIOREX_PAY", percent: 1 })]), null);
  });

  it("percent of collected net, refunds reduce the share, shares sum to collections", () => {
    const t = computeStatement(
      [line({ net: 500, gross: 500 }), line({ net: -100, gross: -100, category: "REFUND" }), line({ visitKey: "v2", net: 300, gross: 342 })],
      [rule({ clinicianId: "doc", percent: 40 })],
      [],
      [],
    );
    assert.equal(t.collectedNet, 700);
    assert.equal(t.collectedGross, 742);
    assert.equal(t.doctorShare, 280);
    assert.equal(t.clinicShare, 420);
    assert.equal(t.visits, 2);
  });

  it("fixed per visit counts only visits with positive net collections", () => {
    const t = computeStatement(
      [line({ visitKey: "a", net: 400 }), line({ visitKey: "b", net: 400 }), line({ visitKey: "b", net: -400 }), line({ visitKey: "a", net: 50, category: "LAB" })],
      [rule({ clinicianId: "doc", ruleType: "FIXED_PER_VISIT", fixedAmount: 150 })],
      [],
      [],
    );
    assert.equal(t.visits, 1);
    assert.equal(t.doctorShare, 150);
    assert.equal(t.clinicShare, 300);
  });

  it("room rental: doctor keeps unmatched collections minus the rental (may go negative)", () => {
    const rental = rule({ clinicianId: "doc", ruleType: "ROOM_RENTAL", fixedAmount: 2000 });
    const t = computeStatement([line({ net: 3000 })], [rental], [], []);
    assert.equal(t.roomRental, 2000);
    assert.equal(t.doctorShare, 1000);
    assert.equal(t.clinicShare, 2000);
    const slow = computeStatement([line({ net: 500 })], [rental], [], []);
    assert.equal(slow.doctorShare, -1500);
    assert.equal(slow.clinicShare, 2000);
  });

  it("no matching rule: the clinic keeps it and it is surfaced as unmatched", () => {
    const t = computeStatement([line({ net: 250 })], [], [], []);
    assert.equal(t.doctorShare, 0);
    assert.equal(t.clinicShare, 250);
    assert.equal(t.unmatchedNet, 250);
  });

  it("adjustments and payouts drive net payable", () => {
    const t = computeStatement(
      [line({ net: 1000 })],
      [rule({ clinicianId: "doc", percent: 50 })],
      [{ amount: -100, note: "consumables", at: "", byUserId: "o" }],
      [{ amount: 300, method: "CASH", reference: null, at: "", byUserId: "o" }],
    );
    assert.equal(t.adjustments, -100);
    assert.equal(t.payouts, 300);
    assert.equal(t.netPayable, 100);
  });

  it("period ranges follow the market timezone", () => {
    const { start, end } = periodRange("2026-03", "Africa/Cairo");
    assert.equal(start.toISOString(), "2026-02-28T22:00:00.000Z");
    assert.equal(end.toISOString(), "2026-03-31T22:00:00.000Z");
    assert.equal(currentPeriodKey(new Date("2026-03-31T22:30:00Z"), "Africa/Cairo"), "2026-04");
    assert.throws(() => periodRange("2026-13", "UTC"));
  });
});
