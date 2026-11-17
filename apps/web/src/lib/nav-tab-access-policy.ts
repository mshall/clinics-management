import type { NavItemKey } from "@/lib/nav-policy";
import type { DemoRole } from "@/lib/roles";

export type NavTabAccessMode = "read" | "write";

const OPERATIONS_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "clinic_assistant",
  "receptionist",
  "call_center",
]);

const EXPENSES_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "branch_manager",
  "finance_officer",
  "hr_officer",
  "clinic_assistant",
]);

function modeForTab(
  tab: NavItemKey,
  modes?: Record<string, NavTabAccessMode> | null,
): NavTabAccessMode {
  return modes?.[tab] === "read" ? "read" : "write";
}

/** Whether the user may create/update in a module granted via admin tab permissions. */
export function canMutateNavTab(
  tab: NavItemKey,
  role: DemoRole | undefined,
  navTabKeys: string[] | null | undefined,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  if (modeForTab(tab, navTabAccessModes) === "read") return false;
  if (tab === "operations") {
    if (role && OPERATIONS_MUTATE_ROLES.has(role)) return true;
    return Boolean(navTabKeys?.includes(tab) && modeForTab(tab, navTabAccessModes) === "write");
  }
  if (tab === "expenses") {
    if (role && EXPENSES_MUTATE_ROLES.has(role)) return true;
    return Boolean(navTabKeys?.includes(tab) && modeForTab(tab, navTabAccessModes) === "write");
  }
  // Default: role-only modules keep existing behavior
  return true;
}

export function canMutateOperations(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("operations", role, navTabKeys, navTabAccessModes);
}

export function canMutateExpenses(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("expenses", role, navTabKeys, navTabAccessModes);
}