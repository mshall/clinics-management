/** Mirrors `PLAN_NAV_TAB_PRESETS` in `apps/api/src/entitlements/plans-matrix.ts` (PL-06). */
export const PLAN_NAV_TAB_PRESETS = {
  LITE: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
  ],
  PRO: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
    "reports",
    "clinics",
    "expenses",
  ],
  CLINIC: [
    "dashboard",
    "appointments",
    "patients",
    "encounters",
    "revenue",
    "admin",
    "customer_support",
    "profile",
    "reports",
    "clinics",
    "expenses",
    "operations",
    "hr",
  ],
  ENTERPRISE: [
    "dashboard",
    "patients",
    "encounters",
    "appointments",
    "operations",
    "clinics",
    "expenses",
    "revenue",
    "hr",
    "reports",
    "customer_support",
    "admin",
    "doctor_revenue",
    "profile",
  ],
} as const;

export type PlanNavPresetKey = keyof typeof PLAN_NAV_TAB_PRESETS;

const PLAN_ORDER: PlanNavPresetKey[] = ["LITE", "PRO", "CLINIC", "ENTERPRISE"];

export function intersectNavTabsWithPlanPreset(tabKeys: string[], planKey: string | null | undefined): string[] {
  const presetKey = (planKey?.toUpperCase() ?? "ENTERPRISE") as PlanNavPresetKey;
  const preset = new Set(PLAN_NAV_TAB_PRESETS[presetKey] ?? PLAN_NAV_TAB_PRESETS.ENTERPRISE);
  const out = tabKeys.filter((k) => preset.has(k as (typeof PLAN_NAV_TAB_PRESETS.LITE)[number]));
  if (!out.includes("profile") && preset.has("profile")) out.push("profile");
  return out;
}

export function requiredPlanForNavTab(tab: string): PlanNavPresetKey | null {
  for (const plan of PLAN_ORDER) {
    if ((PLAN_NAV_TAB_PRESETS[plan] as readonly string[]).includes(tab)) return plan;
  }
  return null;
}

export function sidebarNavCountExcludingProfile(planKey: string | null | undefined): number {
  const presetKey = (planKey?.toUpperCase() ?? "ENTERPRISE") as PlanNavPresetKey;
  const list = PLAN_NAV_TAB_PRESETS[presetKey] ?? PLAN_NAV_TAB_PRESETS.ENTERPRISE;
  return list.filter((k) => k !== "profile").length;
}