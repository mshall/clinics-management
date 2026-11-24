import { PlanKey } from "@prisma/client";

/**
 * Plan entitlements for the Growth workspace (PROPOSED_DEFAULT, NEEDS_HUMAN: plan packaging is a founder decision). Links work standalone (no Kiorex
 * connection needed). A limit only caps ACTIVE + PAUSED links; revoking frees a slot. The widget configurator is Pro and above.
 */
export interface GrowthPlanLimits {
  maxActiveLinks: number;
  widget: boolean;
  /** Daily aggregate history shown in the workspace. */
  trendDays: number;
}

export const GROWTH_PLAN_LIMITS: Record<PlanKey, GrowthPlanLimits> = {
  LITE: { maxActiveLinks: 3, widget: false, trendDays: 30 },
  PRO: { maxActiveLinks: 25, widget: true, trendDays: 90 },
  CLINIC: { maxActiveLinks: 100, widget: true, trendDays: 180 },
  ENTERPRISE: { maxActiveLinks: 500, widget: true, trendDays: 365 },
  NURSE_LITE: { maxActiveLinks: 3, widget: false, trendDays: 30 },
  NURSE_PRO: { maxActiveLinks: 25, widget: true, trendDays: 90 },
  NURSE_AGENCY: { maxActiveLinks: 100, widget: true, trendDays: 180 },
};

export function growthLimitsFor(plan: PlanKey): GrowthPlanLimits {
  return GROWTH_PLAN_LIMITS[plan] ?? GROWTH_PLAN_LIMITS.LITE;
}
