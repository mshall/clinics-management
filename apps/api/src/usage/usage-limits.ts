import { PlanKey, UsageMetric } from "@prisma/client";

export type UsageLimitMap = Record<UsageMetric, number>;

const LITE_LIMITS: UsageLimitMap = {
  WHATSAPP_MESSAGES: 100,
  SMS_MESSAGES: 50,
  AI_SCRIBE_MINUTES: 30,
  AI_ASSISTANT_REQUESTS: 200,
  ACTIVE_CLINICIANS: 1,
};

const PRO_LIMITS: UsageLimitMap = {
  WHATSAPP_MESSAGES: 2000,
  SMS_MESSAGES: 500,
  AI_SCRIBE_MINUTES: 300,
  AI_ASSISTANT_REQUESTS: 5_000,
  ACTIVE_CLINICIANS: 10,
};

const CLINIC_LIMITS: UsageLimitMap = {
  WHATSAPP_MESSAGES: 10_000,
  SMS_MESSAGES: 2_000,
  AI_SCRIBE_MINUTES: 2_000,
  AI_ASSISTANT_REQUESTS: 50_000,
  ACTIVE_CLINICIANS: 50,
};

const ENTERPRISE_LIMITS: UsageLimitMap = {
  WHATSAPP_MESSAGES: 100_000,
  SMS_MESSAGES: 10_000,
  AI_SCRIBE_MINUTES: 10_000,
  AI_ASSISTANT_REQUESTS: 500_000,
  ACTIVE_CLINICIANS: 500,
};

export function usageLimitsForPlan(planKey: PlanKey): UsageLimitMap {
  switch (planKey) {
    case PlanKey.LITE:
      return LITE_LIMITS;
    case PlanKey.PRO:
      return PRO_LIMITS;
    case PlanKey.CLINIC:
      return CLINIC_LIMITS;
    default:
      return ENTERPRISE_LIMITS;
  }
}

export function usageWarningThreshold(limit: number): number {
  return limit * 0.8;
}