import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KiorlyLineType, ListingStatus, PlanKey, Prisma, SubscriptionStatus, VerificationStatus } from "@prisma/client";
import { settlePeriod, type SettlementCalculatorInput } from "./settlement-calculator";
import { DEFAULT_LITE_MIN_INVOICE, resolveSettlementMarketPack } from "./settlement-config";
import { liteKiorexFeesFromSettlement } from "./lite-fees";
import { resolveCarryForwardIn } from "./settlement.service";
import { DEFAULT_DUNNING_TIMELINE, dunningTimelineFromFeatureDefaults } from "../subscriptions/dunning-config";
import { kiorexMarketplacePaused } from "../subscriptions/subscription-access-policy";
import {
  MARKETPLACE_BLOCKER,
  evaluateMarketplaceListingEligibility,
} from "../marketplace/marketplace-listing-eligibility";

function liteInput(overrides: Partial<SettlementCalculatorInput>): SettlementCalculatorInput {
  return {
    periodKey: "2027-08",
    currency: "EGP",
    planKey: PlanKey.LITE,
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
    referencePlanPrice: 0,
    prepaidCoversPeriod: false,
    walletCreditAvailable: 0,
    carryForwardIn: 0,
    liteMinInvoice: 100,
    taxRatePercent: 0,
    ...overrides,
  };
}

describe("SB-05 Lite commission invoicing & minimum invoice", () => {
  it("default minimum invoice matches the commercial-config default (100) when the pack omits it", () => {
    assert.equal(DEFAULT_LITE_MIN_INVOICE, 100);
    assert.equal(resolveSettlementMarketPack(null).liteMinInvoice, 100);
    assert.equal(
      resolveSettlementMarketPack({ kiorlyBilling: { liteMinInvoice: 250 } }).liteMinInvoice,
      250,
    );
  });

  it("below liteMinInvoice: no invoice lines, balance carried forward", () => {
    const r = settlePeriod(
      liteInput({
        commissionGrossBeforeCap: 60,
        commissionItems: [{ chargeId: "c1", amount: 60, patientInitials: "AB" }],
      }),
    );
    assert.equal(r.summary.skippedBelowMinimum, true);
    assert.equal(r.summary.carryForwardOut, "60.00");
    assert.equal(r.lines.length, 0);
    assert.equal(r.total, 0);
  });

  it("AC: carry-forward balance is shown and included next month", () => {
    const august = settlePeriod(
      liteInput({
        commissionGrossBeforeCap: 60,
        commissionItems: [{ chargeId: "c1", amount: 60 }],
      }),
    );
    const carry = Number(august.summary.carryForwardOut);

    const september = settlePeriod(
      liteInput({
        periodKey: "2027-09",
        commissionGrossBeforeCap: 50,
        commissionItems: [{ chargeId: "c2", amount: 50 }],
        carryForwardIn: carry,
      }),
    );
    assert.equal(september.summary.skippedBelowMinimum, false);
    assert.equal(september.summary.carryForwardIn, "60.00");
    const carryLine = september.lines.find((l) => l.refId === "carry-forward");
    assert.ok(carryLine, "carry line on next invoice");
    assert.equal(carryLine.amount, 60);
    assert.equal(carryLine.type, KiorlyLineType.KIOREX_COMMISSION);
    assert.equal(september.total, 110);
    assert.equal(september.summary.carryForwardOut, "0.00");

    const card = liteKiorexFeesFromSettlement({
      periodKey: "2027-09",
      currency: "EGP",
      isLite: true,
      calculation: september,
    });
    assert.equal(card.carriedForward, "60.00");
    assert.equal(card.feesThisMonth, "50.00");
    assert.equal(card.projectedTotal, "110.00");
    assert.equal(card.willInvoice, true);
    assert.equal(card.carryToNextMonth, "0.00");
  });

  it("fees card shows the balance rolling into next month while still below the minimum", () => {
    const r = settlePeriod(
      liteInput({
        commissionGrossBeforeCap: 30,
        commissionItems: [{ chargeId: "c3", amount: 30 }],
        carryForwardIn: 40,
      }),
    );
    const card = liteKiorexFeesFromSettlement({
      periodKey: "2027-08",
      currency: "EGP",
      isLite: true,
      calculation: r,
    });
    assert.equal(card.carriedForward, "40.00");
    assert.equal(card.willInvoice, false);
    assert.equal(card.carryToNextMonth, "70.00");
    assert.equal(card.minInvoice, "100.00");
    assert.equal("marketplacePaused" in card, false, "the fees card never reports a listing pause (SB-05 decision 26 Nov 2026)");
  });

  it("re-settling the period that wrote the carry reuses its carry-in (no double count)", () => {
    const tenant = {
      kiorlySettlementCarry: new Prisma.Decimal(110),
      kiorlySettlementCarryPeriodKey: "2027-09",
      kiorlySettlementCarryIn: new Prisma.Decimal(60),
    };
    assert.equal(resolveCarryForwardIn(tenant, "2027-09"), 60);
    assert.equal(resolveCarryForwardIn(tenant, "2027-10"), 110);
    assert.equal(resolveCarryForwardIn(tenant, "2027-08"), 0);
    assert.equal(
      resolveCarryForwardIn(
        { kiorlySettlementCarry: new Prisma.Decimal(25), kiorlySettlementCarryPeriodKey: null, kiorlySettlementCarryIn: null },
        "2027-09",
      ),
      25,
    );
  });

  it("SB-05 decision (26 Nov 2026): an unpaid Kiorex commission never pauses the listing, even if an old flag value is passed", () => {
    const out = evaluateMarketplaceListingEligibility({
      verificationStatus: VerificationStatus.VERIFIED,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      marketplaceBookableTypeCount: 1,
      hasAvailability: true,
      profileCompletenessPercent: 100,
      // a stale caller or an old DB value must not be able to pause the listing any more
      kiorexBillingPaused: true,
    } as never);
    assert.equal(out.status, ListingStatus.LIVE);
    assert.deepEqual(out.blockers, []);
    assert.equal(out.pausedReason, null);
  });

  it("the subscription state (non-commission dunning) still pauses the listing", () => {
    for (const subscriptionStatus of [SubscriptionStatus.READ_ONLY, SubscriptionStatus.SUSPENDED]) {
      const out = evaluateMarketplaceListingEligibility({
        verificationStatus: VerificationStatus.VERIFIED,
        subscriptionStatus,
        marketplaceBookableTypeCount: 1,
        hasAvailability: true,
        profileCompletenessPercent: 100,
      });
      assert.equal(out.status, ListingStatus.PAUSED);
      assert.equal(out.pausedReason, MARKETPLACE_BLOCKER.BILLING);
    }
  });

  it("there is no commission listing-pause window in the dunning timeline or the market pack bridge", () => {
    assert.equal("liteCommissionMarketplacePauseDays" in DEFAULT_DUNNING_TIMELINE, false);
    const fromPack = dunningTimelineFromFeatureDefaults({ kiorlyBilling: { dunning: { liteCommissionMarketplacePauseDays: 30 } } });
    assert.equal("liteCommissionMarketplacePauseDays" in fromPack, false, "a stale pack value is ignored");
    assert.equal(kiorexMarketplacePaused(SubscriptionStatus.ACTIVE), false);
    assert.equal(kiorexMarketplacePaused(SubscriptionStatus.GRACE), false);
    assert.equal(kiorexMarketplacePaused(SubscriptionStatus.READ_ONLY), true);
    assert.equal(kiorexMarketplacePaused(SubscriptionStatus.SUSPENDED), true);
  });
});
