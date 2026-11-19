import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shiftCloseOutcome, shiftVarianceReviewThreshold, summarizeDrawer } from "./cashier-shift";

describe("MN-03 cash drawer maths", () => {
  it("threshold comes from the market pack with a safe default", () => {
    assert.equal(shiftVarianceReviewThreshold({ billing: { shiftVarianceReviewThreshold: 200 } }), 200);
    assert.equal(shiftVarianceReviewThreshold({ billing: { shiftVarianceReviewThreshold: "15" } }), 15);
    assert.equal(shiftVarianceReviewThreshold({}), 50);
    assert.equal(shiftVarianceReviewThreshold({ billing: { shiftVarianceReviewThreshold: -1 } }), 50);
  });

  it("summarizes payments and non-payment movements", () => {
    const t = summarizeDrawer(
      [
        { method: "CASH", amount: 300 },
        { method: "CARD", amount: 200 },
        { method: "WALLET", amount: 75 },
      ],
      [
        { direction: "OUT", method: "CASH", amount: 50, sourceType: "REFUND" },
        { direction: "IN", method: "CASH", amount: 100, sourceType: "DEPOSIT" },
        { direction: "OUT", method: "CARD", amount: 20, sourceType: "REFUND" },
      ],
      3,
    );
    assert.equal(t.cashIn, 400);
    assert.equal(t.cashOut, 50);
    assert.equal(t.netCash, 350);
    assert.equal(t.netCard, 180);
    assert.deepEqual(t.paymentsByMethod, { CASH: 300, CARD: 200, WALLET: 75 });
    assert.deepEqual(t.movementsBySource, { REFUND: -70, DEPOSIT: 100 });
  });

  it("variance = counted − (float + net cash); review only above the threshold", () => {
    const base = { openingFloat: 500, totals: { netCash: 250, netCard: 200 }, threshold: 50 };
    const exact = shiftCloseOutcome({ ...base, countedCash: 750, countedCard: 200 });
    assert.deepEqual([exact.expectedCash, exact.cashVariance, exact.hasVariance, exact.needsReview], [750, 0, false, false]);
    const small = shiftCloseOutcome({ ...base, countedCash: 740, countedCard: 200 });
    assert.deepEqual([small.cashVariance, small.hasVariance, small.needsReview], [-10, true, false]);
    const atLimit = shiftCloseOutcome({ ...base, countedCash: 800, countedCard: 200 });
    assert.equal(atLimit.needsReview, false, "exactly the threshold is tolerated");
    const over = shiftCloseOutcome({ ...base, countedCash: 600, countedCard: 200 });
    assert.equal(over.needsReview, true);
    const card = shiftCloseOutcome({ ...base, countedCash: 750, countedCard: 120 });
    assert.deepEqual([card.cardVariance, card.needsReview], [-80, true]);
  });
});
