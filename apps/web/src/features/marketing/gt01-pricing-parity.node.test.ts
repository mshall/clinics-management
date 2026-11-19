import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  marketingPlanRows,
  monthlyAmountFromPrice,
  patientsToMakeKiorlyFree,
  type PublicPlan,
} from "./kiorly-free-calculator";

describe("GT-01 marketing pricing parity", () => {
  const apiPlans: PublicPlan[] = [
    {
      key: "PRO",
      nameEn: "Pro",
      nameAr: "برو",
      prices: [
        { amount: "999.00", currency: "EGP", interval: "MONTHLY", unit: "PER_CLINICIAN" },
        { amount: "9990.00", currency: "EGP", interval: "ANNUAL", unit: "PER_CLINICIAN" },
      ],
    },
    {
      key: "LITE",
      nameEn: "Lite",
      nameAr: "لايت",
      prices: [{ amount: "0.00", currency: "EGP", interval: "MONTHLY", unit: "PER_TENANT", cohortKey: null }],
    },
  ];

  it("pricing on the site always equals the API values", () => {
    const rows = marketingPlanRows(apiPlans, "en");
    assert.equal(rows.length, apiPlans.length);
    for (let i = 0; i < apiPlans.length; i++) {
      assert.equal(rows[i].key, apiPlans[i].key);
      assert.equal(rows[i].prices.length, apiPlans[i].prices.length);
      for (let j = 0; j < apiPlans[i].prices.length; j++) {
        assert.equal(rows[i].prices[j].amount, apiPlans[i].prices[j].amount);
        assert.equal(rows[i].prices[j].currency, apiPlans[i].prices[j].currency);
        assert.equal(rows[i].prices[j].interval, apiPlans[i].prices[j].interval);
        assert.ok(rows[i].prices[j].label.includes(apiPlans[i].prices[j].amount));
      }
    }
  });

  it("calculator uses monthly-equivalent plan price and public fee", () => {
    assert.equal(patientsToMakeKiorlyFree(999, 40), 25);
    assert.equal(patientsToMakeKiorlyFree(1200, 40), 30);
    assert.equal(monthlyAmountFromPrice(apiPlans[0].prices[1]), 9990 / 12);
    assert.equal(patientsToMakeKiorlyFree(0, 40), null);
  });
});
