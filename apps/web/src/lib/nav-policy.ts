import type { DemoRole } from "@/lib/roles";

export type NavItemKey =
  | "dashboard"
  | "patients"
  | "encounters"
  | "appointments"
  | "operations"
  | "clinics"
  | "expenses"
  | "revenue"
  | "hr"
  | "reports"
  | "admin"
  | "doctor_revenue"
  | "profile";

const FULL: NavItemKey[] = [
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
  "admin",
  "profile",
];

const ROLE_KEYS: Record<DemoRole, NavItemKey[]> = {
  group_admin: FULL,
  branch_manager: FULL,
  finance_officer: FULL,
  hr_officer: FULL,
  physician: ["patients", "encounters", "appointments", "operations", "doctor_revenue", "profile", "reports"],
  nurse: ["patients", "appointments", "encounters", "profile"],
  receptionist: ["patients", "appointments", "encounters", "operations", "profile"],
  clinic_admin: [
    "dashboard",
    "patients",
    "appointments",
    "encounters",
    "operations",
    "clinics",
    "expenses",
    "revenue",
    "hr",
    "reports",
    "admin",
    "profile",
  ],
  clinic_assistant: ["patients", "appointments", "encounters", "operations", "expenses", "revenue", "profile"],
};

export function navKeysForRole(role: DemoRole | undefined): Set<NavItemKey> {
  if (!role) return new Set();
  return new Set(ROLE_KEYS[role] ?? FULL);
}

/** Route path for each tab (used for default landing when dashboard is hidden). */
export const NAV_ITEM_PATH: Record<NavItemKey, string> = {
  dashboard: "/",
  patients: "/patients",
  encounters: "/encounters",
  appointments: "/appointments",
  operations: "/operations",
  clinics: "/clinics",
  expenses: "/expenses",
  revenue: "/revenue",
  hr: "/hr",
  reports: "/reports",
  admin: "/admin",
  doctor_revenue: "/doctor-revenue",
  profile: "/profile",
};

const HOME_PRIORITY: NavItemKey[] = [
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
  "doctor_revenue",
  "admin",
  "profile",
];

/** Role tab keys in a stable sidebar order (for admin pickers). */
export function orderedNavKeysForRole(role: DemoRole | undefined): NavItemKey[] {
  if (!role) return [];
  const set = navKeysForRole(role);
  return HOME_PRIORITY.filter((k) => set.has(k));
}

/**
 * When a clinic/group admin assigns a subset of tabs, the effective menu is the
 * intersection of role defaults and the stored grant (always includes `profile`).
 */
export function effectiveNavKeys(role: DemoRole | undefined, navTabKeys: string[] | null | undefined): Set<NavItemKey> {
  const base = navKeysForRole(role);
  if (!navTabKeys?.length) return base;
  const grant = new Set(
    navTabKeys.filter((k): k is NavItemKey => (NAV_ITEM_PATH as Record<string, string>)[k] !== undefined && base.has(k as NavItemKey))
  );
  const out = new Set<NavItemKey>();
  for (const k of base) {
    if (grant.has(k)) out.add(k);
  }
  out.add("profile");
  return out;
}

export function showNavItem(
  role: DemoRole | undefined,
  key: NavItemKey,
  navTabKeys?: string[] | null
): boolean {
  return effectiveNavKeys(role, navTabKeys).has(key);
}

/** Landing path after sign-in when the dashboard is not in the role menu. */
export function defaultHomeForRole(role: DemoRole | undefined, navTabKeys?: string[] | null): string {
  if (!role) return "/";
  const keys = effectiveNavKeys(role, navTabKeys);
  for (const k of HOME_PRIORITY) {
    if (keys.has(k)) return NAV_ITEM_PATH[k];
  }
  return "/profile";
}
