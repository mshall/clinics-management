import { intersectNavTabsWithPlanPreset } from "@/lib/plan-nav-presets";

/** Mirrors `NAV_TAB_ENTITLEMENT` in `apps/api/src/entitlements/plans-matrix.ts` (PL-04). */
export const NAV_TAB_ENTITLEMENT: Record<string, string> = {
  operations: "mod_operations",
  expenses: "mod_expenses",
  revenue: "mod_revenue",
  hr: "mod_hr",
  reports: "mod_reports",
  doctor_revenue: "mod_revenue",
};

function entitlementTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return false;
}

export function filterNavKeysByEntitlements<T extends string>(
  keys: Iterable<T>,
  entitlements: Record<string, unknown> | null | undefined,
): T[] {
  const out: T[] = [];
  for (const key of keys) {
    const required = NAV_TAB_ENTITLEMENT[key];
    if (!required || entitlementTruthy(entitlements?.[required])) out.push(key);
  }
  return out;
}

export function applyPlanNavPipeline<T extends string>(
  keys: Iterable<T>,
  planKey: string | null | undefined,
  entitlements: Record<string, unknown> | null | undefined,
): T[] {
  const list = [...keys];
  const withPlan = intersectNavTabsWithPlanPreset(list, planKey) as T[];
  return filterNavKeysByEntitlements(withPlan, entitlements);
}