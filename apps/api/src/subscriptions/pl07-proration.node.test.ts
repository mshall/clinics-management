import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingInterval, PlanKey, PriceUnit } from "@prisma/client";
import {
  computePlanChangeProration,
  computeSeatChangeProration,
  remainingPeriodFraction,
} from "./subscription-proration";

const perClinician = (amount: number, interval: BillingInterval = "MONTHLY") => ({
  amount,
  unit: "PER_CLINICIAN" as PriceUnit,
  includedClinicians: 1,
  extraClinicianAmount: null,
  interval,
});

describe("PL-07 proration", () => {
  it("mid-month upgrade charges net prorated difference", () => {
    const periodStart = new Date("2026-03-01T00:00:00.000Z");
    const periodEnd = new Date("2026-04-01T00:00:00.000Z");
    const now = new Date("2026-03-16T12:00:00.000Z");
    const fraction = remainingPeriodFraction(periodStart, periodEnd, now);
    assert.ok(fraction > 0.45 && fraction < 0.55);

    const preview = computePlanChangeProration({
      currency: "EGP",
      periodStart,
      periodEnd,
      now,
      currentPlanKey: PlanKey.LITE,
      currentPrice: perClinician(0),
      currentSeats: 1,
      nextPlanKey: PlanKey.PRO,
      nextPrice: perClinician(999),
      nextSeats: 1,
      timing: "IMMEDIATE",
    });
    assert.equal(preview.timing, "IMMEDIATE");
    assert.equal(preview.isUpgrade, true);
    const expectedCharge = 999 * fraction;
    assert.ok(Math.abs(Number(preview.charge) - expectedCharge) < 0.05);
    assert.equal(preview.netDue, preview.charge);
  });

  it("mid-month seat add prorates added seat cost", () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-06-01T00:00:00.000Z");
    const now = new Date("2026-05-11T00:00:00.000Z");
    const preview = computeSeatChangeProration({
      currency: "EGP",
      periodStart,
      periodEnd,
      now,
      price: perClinician(999),
      currentSeats: 1,
      nextSeats: 2,
      timing: "IMMEDIATE",
    });
    assert.equal(preview.timing, "IMMEDIATE");
    assert.ok(Number(preview.netDue) > 0);
    assert.ok(Number(preview.netDue) < 999);
  });

  it("annual upgrade at month 5 prorates remaining months", () => {
    const periodStart = new Date("2026-01-01T00:00:00.000Z");
    const periodEnd = new Date("2027-01-01T00:00:00.000Z");
    const now = new Date("2026-06-01T00:00:00.000Z");
    const fraction = remainingPeriodFraction(periodStart, periodEnd, now);
    assert.ok(fraction > 0.55 && fraction < 0.6);

    const preview = computePlanChangeProration({
      currency: "EGP",
      periodStart,
      periodEnd,
      now,
      currentPlanKey: PlanKey.PRO,
      currentPrice: perClinician(999 * 12, "ANNUAL"),
      currentSeats: 1,
      nextPlanKey: PlanKey.CLINIC,
      nextPrice: {
        amount: 3499 * 12,
        unit: "PER_TENANT",
        includedClinicians: 5,
        extraClinicianAmount: 699,
        interval: "ANNUAL",
      },
      nextSeats: 5,
      timing: "IMMEDIATE",
    });
    assert.equal(preview.timing, "IMMEDIATE");
    assert.ok(Number(preview.netDue) > 0);
    const fullCurrent = 999 * 12;
    const fullNext = 3499 * 12;
    const expectedNet = Math.max(0, fullNext * fraction - fullCurrent * fraction);
    assert.ok(Math.abs(Number(preview.netDue) - expectedNet) < 1);
  });
});