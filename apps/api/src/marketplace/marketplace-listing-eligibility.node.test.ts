import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListingStatus, SubscriptionStatus, VerificationStatus } from "@prisma/client";
import { evaluateMarketplaceListingEligibility, MARKETPLACE_BLOCKER } from "./marketplace-listing-eligibility";

describe("KX-01 marketplace listing eligibility", () => {
  it("goes LIVE when verification, billing, types, and availability pass", () => {
    const out = evaluateMarketplaceListingEligibility({
      verificationStatus: VerificationStatus.VERIFIED,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      marketplaceBookableTypeCount: 1,
      hasAvailability: true,
      profileCompletenessPercent: 85,
    });
    assert.equal(out.status, ListingStatus.LIVE);
    assert.deepEqual(out.blockers, []);
  });

  it("blocks LIVE when profile completeness is below 80%", () => {
    const out = evaluateMarketplaceListingEligibility({
      verificationStatus: VerificationStatus.VERIFIED,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      marketplaceBookableTypeCount: 2,
      hasAvailability: true,
      profileCompletenessPercent: 50,
    });
    assert.notEqual(out.status, ListingStatus.LIVE);
    assert.ok(out.blockers.includes(MARKETPLACE_BLOCKER.PROFILE));
  });

  it("pauses for billing when subscription is READ_ONLY", () => {
    const out = evaluateMarketplaceListingEligibility({
      verificationStatus: VerificationStatus.VERIFIED,
      subscriptionStatus: SubscriptionStatus.READ_ONLY,
      marketplaceBookableTypeCount: 2,
      hasAvailability: true,
      profileCompletenessPercent: 90,
    });
    assert.equal(out.status, ListingStatus.PAUSED);
    assert.equal(out.pausedReason, MARKETPLACE_BLOCKER.BILLING);
  });
});