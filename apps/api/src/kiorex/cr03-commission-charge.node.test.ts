import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CommissionChargeStatus } from "@prisma/client";
import { isActiveCommissionChargeStatus } from "./commission-charge-status";
import { resolveDisputeDeadlineDays } from "./kiorex-commission-config";

describe("CR-03 commission charge helpers", () => {
  it("treats PENDING CONFIRMED DISPUTED BILLED as active", () => {
    assert.equal(isActiveCommissionChargeStatus(CommissionChargeStatus.PENDING), true);
    assert.equal(isActiveCommissionChargeStatus(CommissionChargeStatus.CONFIRMED), true);
    assert.equal(isActiveCommissionChargeStatus(CommissionChargeStatus.DISPUTED), true);
    assert.equal(isActiveCommissionChargeStatus(CommissionChargeStatus.BILLED), true);
    assert.equal(isActiveCommissionChargeStatus(CommissionChargeStatus.REVERSED), false);
  });

  it("resolves dispute deadline days from market pack", () => {
    assert.equal(resolveDisputeDeadlineDays({ kiorex: { disputeDeadlineDays: 14 } }), 14);
    assert.equal(resolveDisputeDeadlineDays({}), 30);
  });
});