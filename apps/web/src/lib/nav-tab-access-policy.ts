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

const REVENUE_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "finance_officer",
  "clinic_admin",
]);

const PATIENTS_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "clinic_assistant",
  "branch_manager",
  "call_center",
]);

const HR_MUTATE_ROLES = new Set<DemoRole>(["group_admin", "clinic_admin", "hr_officer", "branch_manager"]);

const CLINICS_MUTATE_ROLES = new Set<DemoRole>(["group_admin", "clinic_admin", "branch_manager"]);

const SUPPORT_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "call_center",
]);

const APPOINTMENTS_MUTATE_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "finance_officer",
  "hr_officer",
  "clinic_admin",
  "clinic_assistant",
  "physician",
  "nurse",
  "receptionist",
  "call_center",
]);

const ENCOUNTERS_MUTATE_ROLES = APPOINTMENTS_MUTATE_ROLES;

const MUTATE_BY_TAB: Partial<Record<NavItemKey, ReadonlySet<DemoRole>>> = {
  operations: OPERATIONS_MUTATE_ROLES,
  expenses: EXPENSES_MUTATE_ROLES,
  revenue: REVENUE_MUTATE_ROLES,
  patients: PATIENTS_MUTATE_ROLES,
  hr: HR_MUTATE_ROLES,
  clinics: CLINICS_MUTATE_ROLES,
  customer_support: SUPPORT_MUTATE_ROLES,
  appointments: APPOINTMENTS_MUTATE_ROLES,
  encounters: ENCOUNTERS_MUTATE_ROLES,
};

function modeForTab(
  tab: NavItemKey,
  modes?: Record<string, NavTabAccessMode> | null,
): NavTabAccessMode {
  return modes?.[tab] === "read" ? "read" : "write";
}

function grantedWriteTab(
  tab: NavItemKey,
  navTabKeys: string[] | null | undefined,
  modes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return Boolean(navTabKeys?.includes(tab) && modeForTab(tab, modes) === "write");
}

/** Whether the user may create/update in a module granted via admin tab permissions. */
export function canMutateNavTab(
  tab: NavItemKey,
  role: DemoRole | undefined,
  navTabKeys: string[] | null | undefined,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  if (modeForTab(tab, navTabAccessModes) === "read") return false;
  const mutateRoles = MUTATE_BY_TAB[tab];
  if (mutateRoles) {
    if (role && mutateRoles.has(role)) return true;
    return grantedWriteTab(tab, navTabKeys, navTabAccessModes);
  }
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

export function canMutateRevenue(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("revenue", role, navTabKeys, navTabAccessModes);
}

export function canMutatePatients(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("patients", role, navTabKeys, navTabAccessModes);
}

export function canMutateHrNav(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("hr", role, navTabKeys, navTabAccessModes);
}

export function canMutateClinicsNav(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("clinics", role, navTabKeys, navTabAccessModes);
}

export function canMutateAppointmentsNav(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("appointments", role, navTabKeys, navTabAccessModes);
}

export function canMutateEncountersNav(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("encounters", role, navTabKeys, navTabAccessModes);
}

export function canMutateSupportNav(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
): boolean {
  return canMutateNavTab("customer_support", role, navTabKeys, navTabAccessModes);
}