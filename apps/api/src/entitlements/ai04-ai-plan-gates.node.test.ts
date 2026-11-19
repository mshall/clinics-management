import assert from "node:assert/strict";
import { PlanKey } from "@prisma/client";
import { describe, it } from "node:test";
import { ENTITLEMENT_MIN_PLAN, PLAN_MATRIX } from "./plans-matrix";
import { usageLimitsForPlan } from "../usage/usage-limits";

describe("AI-04 AI plan gates", () => {
  it("Lite locks ai_assistant and ai_scribe; Pro+ unlocks assistant; scribe is Clinic+ add-on", () => {
    assert.equal(PLAN_MATRIX[PlanKey.LITE].ai_assistant, false);
    assert.equal(PLAN_MATRIX[PlanKey.LITE].ai_scribe, false);
    assert.equal(PLAN_MATRIX[PlanKey.PRO].ai_assistant, true);
    assert.equal(PLAN_MATRIX[PlanKey.PRO].ai_scribe, false);
    assert.equal(PLAN_MATRIX[PlanKey.CLINIC].ai_scribe, true);
    assert.equal(ENTITLEMENT_MIN_PLAN.ai_assistant, PlanKey.PRO);
    assert.equal(ENTITLEMENT_MIN_PLAN.ai_scribe, PlanKey.PRO);
  });

  it("Pro+ plans have a positive monthly AI assistant request quota", () => {
    assert.ok(usageLimitsForPlan(PlanKey.PRO).AI_ASSISTANT_REQUESTS > 0);
    assert.ok(usageLimitsForPlan(PlanKey.LITE).AI_ASSISTANT_REQUESTS < usageLimitsForPlan(PlanKey.PRO).AI_ASSISTANT_REQUESTS);
  });
});
