import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UsageMetric } from "@prisma/client";
import { usageLimitsForPlan, usageWarningThreshold } from "./usage-limits";
import { UsageMeterService } from "./usage-meter.service";
import { PlanKey } from "@prisma/client";

describe("PL-05 usage limits", () => {
  it("warn threshold is 80% of limit", () => {
    assert.equal(usageWarningThreshold(100), 80);
  });

  it("Lite plan has lower WhatsApp cap than Pro", () => {
    const lite = usageLimitsForPlan(PlanKey.LITE);
    const pro = usageLimitsForPlan(PlanKey.PRO);
    assert.ok(lite[UsageMetric.WHATSAPP_MESSAGES] < pro[UsageMetric.WHATSAPP_MESSAGES]);
  });

  it("periodKey uses UTC year-month", () => {
    const key = UsageMeterService.periodKey(new Date("2027-04-15T12:00:00.000Z"));
    assert.equal(key, "2027-04");
  });
});