import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FeeType } from "@prisma/client";
import { applyPercentCommission, isRateActive, resolveKiorexCommissionRate, type RateRow } from "./kiorex-commission-resolver";
import { lookbackStartAt, resolveNewPatientLookbackMonths } from "../patients/new-patient-config";

/** EDGE-42: commission maths, rate effective-date edges and the 24-month new-patient lookback boundary (injected dates, no wall clock, any server zone). */
const rate = (over: Partial<RateRow>): RateRow => ({ id: "r", marketId: "m", specialty: null, feeType: FeeType.FLAT, amount: 40 as never, percent: null, minAmount: null, maxAmount: null, benchmarkFlat: null, benchmarkPercent: null, benchmarkSource: null, benchmarkCheckedAt: null, validFrom: new Date("2026-01-01T00:00:00Z"), validTo: null, ...over }) as RateRow;

describe("EDGE-42 percent commission rounding (half-up, exact)", () => {
  const cases: Array<[number, number, number]> = [[33.5, 3, 1.01], [9.5, 3, 0.29], [53.5, 5, 2.68], [100, 7.5, 7.5], [0.01, 50, 0.01], [199.99, 10, 20], [1234.56, 12.5, 154.32], [0, 10, 0]];
  for (const [fee, pct, want] of cases) it(`${fee} at ${pct}% = ${want}`, () => assert.equal(applyPercentCommission(fee, pct, null, null), want));
  it("min and max caps apply after rounding and never produce fractions of a piastre", () => {
    assert.equal(applyPercentCommission(10, 1, 5, null), 5);
    assert.equal(applyPercentCommission(10000, 10, null, 250.555), 250.56);
    assert.equal(applyPercentCommission(100, 10, 12.345, 20), 12.35);
  });
  it("the percentages of a whole book add up: 1000 visits of 33.5 at 3% are exactly 1010.00", () => {
    let total = 0; for (let i = 0; i < 1000; i++) total += Math.round(applyPercentCommission(33.5, 3, null, null) * 100);
    assert.equal(total / 100, 1010);
  });
});

describe("EDGE-42 commission rate effective-date boundaries", () => {
  const t = (iso: string) => new Date(iso);
  it("validFrom is inclusive, validTo is exclusive, to the millisecond", () => {
    const r = rate({ validFrom: t("2026-06-01T00:00:00.000Z"), validTo: t("2026-07-01T00:00:00.000Z") });
    assert.equal(isRateActive(r, t("2026-05-31T23:59:59.999Z")), false);
    assert.equal(isRateActive(r, t("2026-06-01T00:00:00.000Z")), true);
    assert.equal(isRateActive(r, t("2026-06-30T23:59:59.999Z")), true);
    assert.equal(isRateActive(r, t("2026-07-01T00:00:00.000Z")), false);
  });
  it("two adjacent rates never both apply and never leave a gap at the changeover instant", () => {
    const a = rate({ id: "a", amount: 40 as never, validTo: t("2026-07-01T00:00:00Z") });
    const b = rate({ id: "b", amount: 55 as never, validFrom: t("2026-07-01T00:00:00Z") });
    assert.equal(resolveKiorexCommissionRate([a, b], null, t("2026-06-30T23:59:59.999Z"))?.id, "a");
    assert.equal(resolveKiorexCommissionRate([a, b], null, t("2026-07-01T00:00:00Z"))?.id, "b");
  });
  it("a booking priced before a rate change keeps the old rate when evaluated at its own attendance instant (re-evaluation uses `at`, not now)", () => {
    const a = rate({ id: "a", validTo: t("2026-07-01T00:00:00Z") }); const b = rate({ id: "b", validFrom: t("2026-07-01T00:00:00Z") });
    assert.equal(resolveKiorexCommissionRate([a, b], null, t("2026-06-15T09:00:00Z"))?.id, "a");
  });
  it("no rate in force is null (never a silent zero or the newest future rate)", () => {
    const future = rate({ validFrom: t("2027-01-01T00:00:00Z") });
    assert.equal(resolveKiorexCommissionRate([future], null, t("2026-12-31T23:59:59Z")), null);
  });
  it("an overlapping newer rate wins over an older still-open one (newest validFrom first)", () => {
    const old = rate({ id: "old", validFrom: t("2026-01-01T00:00:00Z") }); const newer = rate({ id: "new", validFrom: t("2026-03-01T00:00:00Z") });
    assert.equal(resolveKiorexCommissionRate([old, newer], null, t("2026-03-01T00:00:00Z"))?.id, "new");
  });
});

describe("EDGE-42 new-patient lookback window start (UTC, month-end clamped)", () => {
  const iso = (d: Date) => d.toISOString();
  it("24 months is exactly two calendar years back at the same instant", () => assert.equal(iso(lookbackStartAt(new Date("2026-11-24T00:00:00.000Z"), 24)), "2024-11-24T00:00:00.000Z"));
  it("month-end dates clamp instead of rolling forward (31 Mar - 1 month = 28 Feb; 29 Feb 2028 - 24 months = 28 Feb 2026)", () => {
    assert.equal(iso(lookbackStartAt(new Date("2026-03-31T10:00:00.000Z"), 1)), "2026-02-28T10:00:00.000Z");
    assert.equal(iso(lookbackStartAt(new Date("2028-02-29T10:00:00.000Z"), 24)), "2026-02-28T10:00:00.000Z");
    assert.equal(iso(lookbackStartAt(new Date("2026-05-31T23:59:59.999Z"), 3)), "2026-02-28T23:59:59.999Z");
  });
  it("crossing a year boundary and a 120 month maximum are exact", () => {
    assert.equal(iso(lookbackStartAt(new Date("2027-01-15T12:00:00.000Z"), 14)), "2025-11-15T12:00:00.000Z");
    assert.equal(iso(lookbackStartAt(new Date("2026-11-24T00:00:00.000Z"), 120)), "2016-11-24T00:00:00.000Z");
  });
  it("the instant does not depend on the server zone (no one-hour shift across a DST change)", () => {
    assert.equal(iso(lookbackStartAt(new Date("2026-04-30T00:30:00.000Z"), 6)), "2025-10-30T00:30:00.000Z");
  });
  it("lookback configuration: out of range, non-number or malformed falls back to 24", () => {
    for (const bad of [null, [], "x", { newPatient: { lookbackMonths: 0 } }, { newPatient: { lookbackMonths: 121 } }, { newPatient: { lookbackMonths: "12" } }, { newPatient: { lookbackMonths: NaN } }]) assert.equal(resolveNewPatientLookbackMonths(bad), 24);
    assert.equal(resolveNewPatientLookbackMonths({ newPatient: { lookbackMonths: 12.9 } }), 12);
  });
});
