import { PlanKey } from "@prisma/client";
import { PLAN_NAV_TAB_PRESETS, filterNavTabsByEntitlements } from "./plans-matrix";

export { PLAN_NAV_TAB_PRESETS };

const PLAN_ORDER: PlanKey[] = [PlanKey.LITE, PlanKey.PRO, PlanKey.CLINIC, PlanKey.ENTERPRISE];

export function intersectNavTabsWithPlanPreset(tabKeys: string[], planKey: PlanKey): string[] {
  const preset = new Set(PLAN_NAV_TAB_PRESETS[planKey]);
  const out = tabKeys.filter((k) => preset.has(k));
  if (!out.includes("profile") && preset.has("profile")) out.push("profile");
  return out;
}

export function applyPlanNavPipeline(
  tabKeys: string[],
  planKey: PlanKey,
  entitlements: Record<string, unknown> | null | undefined,
): string[] {
  const intersected = intersectNavTabsWithPlanPreset(tabKeys, planKey);
  return filterNavTabsByEntitlements(intersected, entitlements);
}

/** Lowest plan tier whose marketing preset includes this nav tab. */
export function requiredPlanForNavTab(tab: string): PlanKey | null {
  for (const plan of PLAN_ORDER) {
    if (PLAN_NAV_TAB_PRESETS[plan].includes(tab)) return plan;
  }
  return null;
}

export function sidebarNavCountForPlan(planKey: PlanKey): number {
  return PLAN_NAV_TAB_PRESETS[planKey].filter((k) => k !== "profile").length;
}