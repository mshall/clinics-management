import type { DemoRole } from "@/lib/roles";

export type NavItemKey =
  | "platform"
  | "platform_organizations"
  | "platform_users"
  | "platform_clinics"
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

const GROUP_SUPERVISOR_NAV: NavItemKey[] = [
  "dashboard",
  "patients",
  "encounters",
  "appointments",
  "operations",
  "expenses",
  "revenue",
  "reports",
  "profile",
];

const ROLE_KEYS: Record<DemoRole, NavItemKey[]> = {
  platform_super_admin: ["platform", "platform_organizations", "platform_users", "platform_clinics", "profile"],
  group_admin: FULL,
  group_supervisor: GROUP_SUPERVISOR_NAV,
  branch_manager: FULL,
  finance_officer: FULL,
  hr_officer: FULL,
  physician: ["patients", "encounters", "appointments", "operations", "doctor_revenue", "profile", "reports"],
  nurse: ["patients", "appointments", "encounters", "profile"],
  receptionist: ["patients", "appointments", "encounters", "operations", "profile"],
  call_center: ["patients", "appointments", "profile"],
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

/** Organization role override when set; otherwise platform role defaults. */
export function roleNavKeysForRole(
  role: DemoRole | undefined,
  roleNavTabKeys?: string[] | null,
): Set<NavItemKey> {
  if (!role) return new Set();
  if (roleNavTabKeys?.length) {
    const base = navKeysForRole(role);
    const out = new Set<NavItemKey>();
    for (const k of roleNavTabKeys) {
      if ((NAV_ITEM_PATH as Record<string, string>)[k] !== undefined && base.has(k as NavItemKey)) {
        out.add(k as NavItemKey);
      }
    }
    out.add("profile");
    return out;
  }
  return navKeysForRole(role);
}

/** Route path for each tab (used for default landing when dashboard is hidden). */
export const NAV_ITEM_PATH: Record<NavItemKey, string> = {
  platform: "/platform",
  platform_organizations: "/platform/organizations",
  platform_users: "/platform/users",
  platform_clinics: "/platform/clinics",
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
  "platform_organizations",
  "platform_users",
  "platform_clinics",
  "platform",
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
export function orderedNavKeysForRole(role: DemoRole | undefined, roleNavTabKeys?: string[] | null): NavItemKey[] {
  if (!role) return [];
  const set = roleNavKeysForRole(role, roleNavTabKeys);
  return HOME_PRIORITY.filter((k) => set.has(k));
}

/**
 * When a clinic/group admin assigns a subset of tabs, the effective menu is the
 * intersection of role defaults and the stored grant (always includes `profile`).
 */
export function effectiveNavKeys(
  role: DemoRole | undefined,
  navTabKeys: string[] | null | undefined,
  roleNavTabKeys?: string[] | null,
): Set<NavItemKey> {
  const base = roleNavKeysForRole(role, roleNavTabKeys);
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
  navTabKeys?: string[] | null,
  roleNavTabKeys?: string[] | null,
): boolean {
  return effectiveNavKeys(role, navTabKeys, roleNavTabKeys).has(key);
}

/** Landing path after sign-in when the dashboard is not in the role menu. */
export function defaultHomeForRole(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  roleNavTabKeys?: string[] | null,
): string {
  if (!role) return "/";
  const keys = effectiveNavKeys(role, navTabKeys, roleNavTabKeys);
  for (const k of HOME_PRIORITY) {
    if (keys.has(k)) return NAV_ITEM_PATH[k];
  }
  return "/profile";
}

/** Map a URL path (including detail routes) to the nav tab that owns it. */
export function navKeyForPath(path: string): NavItemKey | null {
  const pathname = (path.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  const entries = (Object.entries(NAV_ITEM_PATH) as [NavItemKey, string][]).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [key, base] of entries) {
    if (base === "/") {
      if (pathname === "/") return "dashboard";
      continue;
    }
    if (pathname === base || pathname.startsWith(`${base}/`)) return key;
  }
  return null;
}

/** After sign-in, only return `from` when the user's role may access that route. */
export function resolvePostLoginPath(
  role: DemoRole | undefined,
  navTabKeys: string[] | null | undefined,
  from?: string | null,
  roleNavTabKeys?: string[] | null,
): string {
  const home = defaultHomeForRole(role, navTabKeys, roleNavTabKeys);
  if (!from || from === "/login") return home;
  const key = navKeyForPath(from);
  if (!key || !effectiveNavKeys(role, navTabKeys, roleNavTabKeys).has(key)) return home;
  return from;
}
