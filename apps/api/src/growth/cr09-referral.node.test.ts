import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeReferralCode } from "./referral-code.util";
import { referralFraudRejectReason } from "./referral-fraud";

describe("CR-09 referral helpers", () => {
  it("normalizes referral codes", () => {
    assert.equal(normalizeReferralCode(" ab-12 "), "AB12");
  });

  it("rejects same phone fraud", () => {
    assert.equal(
      referralFraudRejectReason({
        referrerOwnerPhone: "+201012345678",
        referredOwnerPhone: "+20 10 1234 5678",
        referrerNationalId: null,
        referredNationalId: null,
        sharedPaymentFingerprint: false,
      }),
      "SAME_PHONE",
    );
  });
});