import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionStatus } from "@prisma/client";
import { assertSubscriptionStatusTransition } from "./subscription-state";
import { addBillingPeriod } from "./subscription-period";

describe("PL-02 subscription state machine", () => {
  it("allows TRIALING -> ACTIVE and blocks TRIALING -> PAST_DUE", () => {
    assert.doesNotThrow(() => assertSubscriptionStatusTransition(SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE));
    assert.throws(() => assertSubscriptionStatusTransition(SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE));
  });

  it("adds monthly and annual billing periods", () => {
    const start = new Date("2026-01-15T00:00:00.000Z");
    const monthly = addBillingPeriod(start, "MONTHLY");
    assert.equal(monthly.getUTCMonth(), 1);
    const annual = addBillingPeriod(start, "ANNUAL");
    assert.equal(annual.getUTCFullYear(), 2027);
  });
});