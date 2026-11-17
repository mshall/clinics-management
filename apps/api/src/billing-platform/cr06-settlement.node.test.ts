import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey } from "@prisma/client";
import { settlePeriod, type SettlementCalculatorInput } from "./settlement-calculator";
import { roundMoney } from "./settlement-rounding";

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

describe("CR-06 settlePeriod — section 04 worked examples", () => {
  it("§04-1 Pro: commission higher than subscription (never both)", () => {
    const r = settlePeriod(
      baseInput({
        subscriptionDue: 999,
        subscriptionList: 999,
        commissionGrossBeforeCap: 1200,
        commissionItems: [{ chargeId: "a", amount: 1200, patientInitials: "AB" }],
      }),
    );
    assert.equal(r.total, 1200);
    assert.equal(r.summary.kiorexPatientCount, 1);
  });

  it("§04-2 Pro: subscription higher than commission", () => {
    const r = settlePeriod(
      baseInput({
        subscriptionDue: 1500,
        subscriptionList: 1500,
        commissionGrossBeforeCap: 800,
        commissionItems: [{ chargeId: "a", amount: 800 }],
      }),
    );
    assert.equal(r.total, 1500);
  });

  it("§04-3 Trial WAIVE_ALL — commission not billed", () => {
    const r = settlePeriod(
      baseInput({
        trialCoversPeriod: true,
        trialCommissionPolicy: "WAIVE_ALL",
        commissionGrossBeforeCap: 500,
        commissionItems: [{ chargeId: "a", amount: 500 }],
      }),
    );
    assert.equal(r.total, 0);
  });

  it("§04-4 Trial WAIVE_UP_TO_PLAN_PRICE — commission below reference plan", () => {
    const r = settlePeriod(
      baseInput({
        trialCoversPeriod: true,
        trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
        referencePlanPrice: 999,
        commissionGrossBeforeCap: 600,
        commissionItems: [{ chargeId: "a", amount: 600 }],
      }),
    );
    assert.equal(r.total, 0);
  });

  it("§04-5 Trial WAIVE_UP_TO_PLAN_PRICE — commission above reference plan", () => {
    const r = settlePeriod(
      baseInput({
        trialCoversPeriod: true,
        trialCommissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
        referencePlanPrice: 999,
        commissionGrossBeforeCap: 1400,
        commissionItems: [{ chargeId: "a", amount: 1400 }],
      }),
    );
    assert.equal(r.total, 401);
  });

  it("§04-6 Trial CHARGE — full commission during trial", () => {
    const r = settlePeriod(
      baseInput({
        trialCoversPeriod: true,
        trialCommissionPolicy: "CHARGE",
        commissionGrossBeforeCap: 300,
        commissionItems: [{ chargeId: "a", amount: 300 }],
      }),
    );
    assert.equal(r.total, 300);
  });

  it("§04-7 Lite — carry forward below liteMinInvoice", () => {
    const r = settlePeriod(
      baseInput({
        planKey: PlanKey.LITE,
        commissionGrossBeforeCap: 40,
        commissionItems: [{ chargeId: "a", amount: 40 }],
        liteMinInvoice: 50,
      }),
    );
    assert.equal(r.summary.skippedBelowMinimum, true);
    assert.equal(r.summary.carryForwardOut, "40.00");
    assert.equal(r.total, 0);
    assert.equal(r.lines.length, 0);
  });

  it("§04-8 Lite — carry in pushes over minimum", () => {
    const r = settlePeriod(
      baseInput({
        planKey: PlanKey.LITE,
        commissionGrossBeforeCap: 40,
        commissionItems: [{ chargeId: "a", amount: 40 }],
        carryForwardIn: 15,
        liteMinInvoice: 50,
      }),
    );
    assert.equal(r.total, 55);
    assert.equal(r.summary.skippedBelowMinimum, false);
  });

  it("§04-9 Credits applied after higher-of", () => {
    const r = settlePeriod(
      baseInput({
        subscriptionDue: 999,
        subscriptionList: 999,
        commissionGrossBeforeCap: 200,
        commissionItems: [{ chargeId: "a", amount: 200 }],
        walletCreditAvailable: 100,
      }),
    );
    assert.equal(r.creditsApplied, 100);
    assert.equal(r.total, 899);
  });
});

describe("CR-06 rounding", () => {
  it("half-up per line and reconciled total", () => {
    const r = settlePeriod(
      baseInput({
        subscriptionDue: 10.125,
        subscriptionList: 10.125,
        commissionGrossBeforeCap: 10.125,
        commissionItems: [
          { chargeId: "1", amount: 5.125 },
          { chargeId: "2", amount: 5 },
        ],
      }),
    );
    for (const line of r.lines) {
      assert.equal(line.amount, roundMoney(line.amount));
    }
    const fromLines = roundMoney(
      r.lines.filter((l) => l.type !== "TAX").reduce((s, l) => s + l.amount, 0) - r.creditsApplied,
    );
    assert.equal(roundMoney(fromLines), roundMoney(r.total - r.tax));
  });
});