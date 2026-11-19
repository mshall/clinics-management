import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey } from "@prisma/client";
import { kiorexFreeProgressFromSettlement } from "./kiorex-progress";
import { settlePeriod, type SettlementCalculatorInput } from "./settlement-calculator";

function baseInput(overrides: Partial<SettlementCalculatorInput>): SettlementCalculatorInput {
  return {
    periodKey: "2027-04",
    currency: "EGP",
    planKey: PlanKey.PRO,
    subscriptionDue: 0,
    subscriptionList: 0,
    seatDue: 0,
    seatCount: 0,
    seatUnitPrice: 0,
    addons: [],
    usageOverage: 0,
    commissionItems: [],
    commissionGrossBeforeCap: 0,
    liteMonthlyCap: null,
    trialCoversPeriod: false,
    trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
    referencePlanPrice: 999,
    prepaidCoversPeriod: false,
    walletCreditAvailable: 0,
    carryForwardIn: 0,
    liteMinInvoice: 50,
    taxRatePercent: 0,
    ...overrides,
  };
}

describe("CR-07 kiorex free progress meter", () => {
  it("meter matches settlement preview figures for the same period", () => {
    const calc = settlePeriod(
      baseInput({
        subscriptionDue: 1000,
        subscriptionList: 1000,
        commissionGrossBeforeCap: 680,
        commissionItems: [
          { chargeId: "a", amount: 400, patientInitials: "AB" },
          { chargeId: "b", amount: 280, patientInitials: "CD" },
        ],
      }),
    );

    const meter = kiorexFreeProgressFromSettlement("2027-04", "EGP", calc);

    assert.equal(meter.commissionGross, Number(calc.summary.commissionGross));
    assert.equal(meter.subscriptionAmount, Number(calc.summary.subscriptionForHigherOf));
    assert.equal(meter.offsetAmount, Number(calc.summary.offsetAmount));
    assert.equal(meter.patientsAttended, calc.summary.kiorexPatientCount);
    assert.equal(meter.patientsAttended, 2);
    assert.equal(meter.feePerPatient, 340);
    assert.equal(meter.patientsTarget, 3);
    assert.equal(meter.patientsStillNeeded, 1);
    assert.equal(meter.isFreeThisMonth, false);
    assert.equal(meter.progressPercent, 68);
  });

  it("marks free when commission covers subscription", () => {
    const calc = settlePeriod(
      baseInput({
        subscriptionDue: 999,
        subscriptionList: 999,
        commissionGrossBeforeCap: 1200,
        commissionItems: [{ chargeId: "a", amount: 1200, patientInitials: "AB" }],
      }),
    );
    const meter = kiorexFreeProgressFromSettlement("2027-04", "EGP", calc);
    assert.equal(meter.isFreeThisMonth, true);
    assert.equal(meter.progressPercent, 100);
    assert.equal(meter.patientsStillNeeded, 0);
  });
});