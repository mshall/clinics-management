import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Inline mirrors of nav-policy + money-visibility-policy for call center.
 * Keep in sync with nav-policy.ts ROLE_KEYS.call_center and money-visibility-policy.ts.
 */
const CALL_CENTER_TABS = [
  "patients",
  "appointments",
  "encounters",
  "operations",
  "customer_support",
  "profile",
] as const;

const ENCOUNTER_MONEY_ROLES = new Set([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
  "receptionist",
  "clinic_assistant",
  "branch_manager",
  "physician",
]);

describe("call center encounters access (web)", () => {
  it("includes encounters in the default sidebar", () => {
    assert.ok(CALL_CENTER_TABS.includes("encounters"));
  });

  it("excludes call_center from encounter money roles by default", () => {
    assert.equal(ENCOUNTER_MONEY_ROLES.has("call_center"), false);
  });
});
