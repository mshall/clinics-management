import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSalesRoi } from "./sales-roi";

describe("GT-05 sales kit ROI", () => {
  it("computes no-show, admin and Kiorex savings vs plan", () => {
    const out = computeSalesRoi({
      noShowsPreventedPerMonth: 10,
      feePerVisit: 300,
      adminHoursSavedPerWeek: 5,
      adminHourlyCost: 50,
      kiorexPatientsPerMonth: 8,
      contributionPerKiorexPatient: 200,
      planMonthlyAmount: 999,
    });
    assert.equal(out.noShowSavings, 3000);
    assert.ok(out.adminSavings > 1000);
    assert.equal(out.kiorexContribution, 1600);
    assert.ok(out.grossMonthlyBenefit > out.planMonthlyAmount);
    assert.ok((out.netMonthlyBenefit ?? 0) > 0);
    assert.ok(out.patientsToOffsetPlan === 5);
  });
});
