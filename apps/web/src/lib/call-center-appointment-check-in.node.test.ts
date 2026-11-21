/**
 * Inline mirrors of appointment fee-edit policy for call center check-in saves.
 * Keep in sync with money-visibility-policy.ts APPOINTMENT_FEE_EDIT_ROLES and
 * appointment-detail-page onSave feePatch gating.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const APPOINTMENT_FEE_EDIT_ROLES = new Set([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
  "receptionist",
  "clinic_assistant",
  "branch_manager",
]);

describe("call center appointment check-in fee patch", () => {
  it("excludes call_center from appointment fee edit by default", () => {
    assert.equal(APPOINTMENT_FEE_EDIT_ROLES.has("call_center"), false);
  });

  it("omits fee fields from save body when fee edit is denied", () => {
    const canSetFees = APPOINTMENT_FEE_EDIT_ROLES.has("call_center");
    const feePatch = canSetFees
      ? { feeAmount: 0, scheduledFeeCollection: { mode: "CASH_ON_VISIT" as const } }
      : {};
    assert.deepEqual(feePatch, {});
  });
});
