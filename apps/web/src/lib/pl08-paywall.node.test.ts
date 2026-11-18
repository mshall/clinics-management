import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_UPGRADE_REQUIRED } from "./plan-upgrade-constants";
import { parsePlanUpgradePayload } from "./plan-upgrade-payload";

describe("PL-08 plan upgrade paywall", () => {
  it("parses API 402 PLAN_UPGRADE_REQUIRED body", () => {
    const parsed = parsePlanUpgradePayload({
      code: PLAN_UPGRADE_REQUIRED,
      entitlement: "mod_reports",
      requiredPlan: "PRO",
    });
    assert.ok(parsed);
    assert.equal(parsed!.entitlement, "mod_reports");
    assert.equal(parsed!.requiredPlan, "PRO");
  });

  it("ignores other error shapes", () => {
    assert.equal(parsePlanUpgradePayload({ code: "OTHER" }), null);
    assert.equal(parsePlanUpgradePayload(null), null);
  });
});