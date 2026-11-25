import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planBillingAr, planBillingEn } from "./plan-billing-strings";
import { daysUntil, FEATURE_GROUPS, isFreePlanKey, isOn, limitOf, priceFor, upgradeTargets, usagePercent, visibleFeatureGroups, type ComparePlan } from "./plan-billing-logic";

const plan = (key: string, relation: ComparePlan["relation"], entitlements: ComparePlan["entitlements"], prices: ComparePlan["prices"] = []): ComparePlan => ({
  key, nameEn: key, nameAr: key, isPublic: true, relation, entitlements, prices, priceNeedsHuman: prices.length === 0, downgradeImpact: null,
});

describe("SUB-01 plan billing logic", () => {
  it("entitlement values: booleans, numbers, unlimited", () => {
    assert.equal(isOn(true), true);
    assert.equal(isOn(0), false);
    assert.equal(isOn(undefined), false);
    assert.equal(limitOf(5), 5);
    assert.equal(limitOf(-1), null);
    assert.equal(limitOf(false), 0);
    assert.equal(limitOf(undefined), null);
  });
  it("usage percent never divides by zero and caps at 100", () => {
    assert.equal(usagePercent(2, 4), 50);
    assert.equal(usagePercent(9, 4), 100);
    assert.equal(usagePercent(1, 0), 100);
    assert.equal(usagePercent(0, 0), 0);
    assert.equal(usagePercent(3, null), null);
  });
  it("only features at least one plan mentions are shown; nurse tools only on the nurse edition", () => {
    const plans = [plan("LITE", "DOWNGRADE", { mod_clinical: false }), plan("PRO", "CURRENT", { mod_clinical: true, nurse_agency: false })];
    const clinic = visibleFeatureGroups(plans, "CLINIC");
    assert.deepEqual(clinic.map((g) => g.id), ["care"]);
    assert.deepEqual(clinic[0]!.keys, ["mod_clinical"]);
    assert.equal(visibleFeatureGroups(plans, "NURSE").some((g) => g.id === "nurse"), true);
  });
  it("price lookup returns null when the market has no active price (UI shows the placeholder)", () => {
    const p = plan("PRO", "UPGRADE", {}, [{ interval: "MONTHLY", unit: "PER_CLINICIAN", amount: "1.00", currency: "EGP", includedClinicians: 1, extraClinicianAmount: null }]);
    assert.equal(priceFor(p, "MONTHLY")?.amount, "1.00");
    assert.equal(priceFor(p, "ANNUAL"), null);
  });
  it("upgrade targets exclude Enterprise and non-upgrades", () => {
    const plans = [plan("LITE", "CURRENT", {}), plan("PRO", "UPGRADE", {}), plan("CLINIC", "UPGRADE", {}), plan("ENTERPRISE", "UPGRADE", {})];
    assert.deepEqual(upgradeTargets(plans).map((p) => p.key), ["PRO", "CLINIC"]);
    assert.equal(isFreePlanKey("LITE") && isFreePlanKey("NURSE_LITE") && !isFreePlanKey("PRO"), true);
  });
  it("days until", () => {
    const now = new Date("2026-12-01T00:00:00Z").getTime();
    assert.equal(daysUntil("2026-12-04T00:00:00Z", now), 3);
    assert.equal(daysUntil("2026-11-01T00:00:00Z", now), 0);
    assert.equal(daysUntil(null, now), null);
  });
  it("EN and AR have the same keys; every feature in a group has a label in both languages", () => {
    const keys = (o: Record<string, unknown>, prefix = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
    assert.deepEqual(keys(planBillingEn).sort(), keys(planBillingAr).sort());
    for (const g of FEATURE_GROUPS) for (const k of g.keys) {
      assert.ok(k in planBillingEn.features, `EN label for ${k}`);
      assert.ok(k in planBillingAr.features, `AR label for ${k}`);
    }
    assert.match(planBillingAr.autoRenewOn, /[؀-ۿ]/);
  });
});
