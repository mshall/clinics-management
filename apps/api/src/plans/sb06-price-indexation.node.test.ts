import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingInterval, PriceUnit } from "@prisma/client";
import {
  DEFAULT_PRICE_CHANGE_NOTICE_DAYS,
  bilingualPriceChangeNotice,
  canApplyPriceMigration,
  computePriceMigrationSchedule,
  monthlyAmountForPrice,
  priceChangeNoticeDaysFromFeatureDefaults,
} from "./price-indexation";

const DAY = 86_400_000;

describe("SB-06 price indexation & grandfathering", () => {
  it("moves at the first renewal after the 30-day notice", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const s = computePriceMigrationSchedule({
      noticeFrom: now,
      noticeDays: 30,
      currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
      interval: BillingInterval.MONTHLY,
      priceLockUntil: null,
    });
    assert.equal(s.effectiveAt.toISOString(), "2027-01-01T00:00:00.000Z");
    assert.ok(s.effectiveAt.getTime() - now.getTime() >= 30 * DAY);
    assert.ok(s.noticeDueAt <= new Date(s.effectiveAt.getTime() - 30 * DAY));
    assert.equal(s.lockedUntil, null);
  });

  it("AC: founding tenants never get a price change before priceLockUntil", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const lock = new Date("2028-11-18T00:00:00Z");
    for (const interval of [BillingInterval.MONTHLY, BillingInterval.ANNUAL]) {
      const s = computePriceMigrationSchedule({
        noticeFrom: now,
        noticeDays: 30,
        currentPeriodEnd: new Date("2026-12-05T00:00:00Z"),
        interval,
        priceLockUntil: lock,
      });
      assert.ok(s.effectiveAt >= lock, `${interval} effective ${s.effectiveAt.toISOString()} before lock`);
      assert.equal(s.lockedUntil?.toISOString(), lock.toISOString());
    }

    // Even with a tampered / stale effective date, apply refuses while the lock is in force.
    assert.equal(
      canApplyPriceMigration({
        now: new Date("2027-02-01T00:00:00Z"),
        effectiveAt: new Date("2027-01-05T00:00:00Z"),
        noticeSentAt: new Date("2026-11-18T00:00:00Z"),
        noticeDays: 30,
        priceLockUntil: lock,
      }),
      false,
    );
  });

  it("an expired lock does not delay the move", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const s = computePriceMigrationSchedule({
      noticeFrom: now,
      noticeDays: 30,
      currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
      interval: BillingInterval.MONTHLY,
      priceLockUntil: new Date("2026-01-01T00:00:00Z"),
    });
    assert.equal(s.lockedUntil, null);
    assert.equal(s.effectiveAt.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  it("never moves before the new price's validFrom", () => {
    const s = computePriceMigrationSchedule({
      noticeFrom: new Date("2026-11-18T00:00:00Z"),
      noticeDays: 30,
      currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
      interval: BillingInterval.MONTHLY,
      priceLockUntil: null,
      notBefore: new Date("2027-03-15T00:00:00Z"),
    });
    assert.equal(s.effectiveAt.toISOString(), "2027-04-01T00:00:00.000Z");
  });

  it("apply requires a full notice period before the effective date", () => {
    const effectiveAt = new Date("2027-01-01T00:00:00Z");
    const base = { now: new Date("2027-01-01T01:00:00Z"), effectiveAt, noticeDays: 30, priceLockUntil: null };
    assert.equal(canApplyPriceMigration({ ...base, noticeSentAt: null }), false);
    assert.equal(canApplyPriceMigration({ ...base, noticeSentAt: new Date("2026-12-20T00:00:00Z") }), false);
    assert.equal(canApplyPriceMigration({ ...base, noticeSentAt: new Date("2026-11-30T00:00:00Z") }), true);
    assert.equal(
      canApplyPriceMigration({ ...base, now: new Date("2026-12-31T00:00:00Z"), noticeSentAt: new Date("2026-11-01T00:00:00Z") }),
      false,
    );
  });

  it("MRR normalisation: annual ÷ 12, per-clinician × seats, extra seats on per-org", () => {
    assert.equal(
      monthlyAmountForPrice(
        { interval: BillingInterval.ANNUAL, unit: PriceUnit.PER_TENANT, amount: 12_000, includedClinicians: 1, extraClinicianAmount: null },
        1,
      ),
      1000,
    );
    assert.equal(
      monthlyAmountForPrice(
        { interval: BillingInterval.MONTHLY, unit: PriceUnit.PER_CLINICIAN, amount: 500, includedClinicians: 1, extraClinicianAmount: null },
        3,
      ),
      1500,
    );
    assert.equal(
      monthlyAmountForPrice(
        { interval: BillingInterval.MONTHLY, unit: PriceUnit.PER_TENANT, amount: 999, includedClinicians: 2, extraClinicianAmount: 300 },
        4,
      ),
      1599,
    );
  });

  it("notice days come from the market pack (default 30)", () => {
    assert.equal(DEFAULT_PRICE_CHANGE_NOTICE_DAYS, 30);
    assert.equal(priceChangeNoticeDaysFromFeatureDefaults(null), 30);
    assert.equal(priceChangeNoticeDaysFromFeatureDefaults({ kiorlyBilling: { priceChangeNoticeDays: 45 } }), 45);
  });

  it("notice is bilingual and states consent-by-continuing", () => {
    const m = bilingualPriceChangeNotice({
      planNameEn: "Pro",
      planNameAr: "برو",
      fromAmount: "999.00",
      toAmount: "1199.00",
      currency: "EGP",
      effectiveAt: new Date("2027-01-01T00:00:00Z"),
    });
    assert.match(m.en, /999\.00 to 1199\.00 EGP/);
    assert.match(m.en, /continuing your subscription/);
    assert.match(m.ar, /1199\.00/);
    assert.match(m.ar, /استمرار اشتراكك/);
  });
});
