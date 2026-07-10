import { UserRole } from "@prisma/client";

/** Must match `NavItemKey` in `apps/web/src/lib/nav-policy.ts`. */
export const VALID_NAV_TAB_KEYS = new Set([
  "platform",
  "platform_organizations",
  "platform_users",
  "platform_clinics",
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
  "doctor_revenue",
  "profile",
]);

const FULL: string[] = [
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

/** Org-wide oversight: clinical & financial data without admin / HR / clinics management. */
const GROUP_SUPERVISOR_TABS: string[] = [
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

const ROLE_MAX: Record<UserRole, readonly string[]> = {
  [UserRole.GROUP_ADMIN]: FULL,
  [UserRole.GROUP_SUPERVISOR]: GROUP_SUPERVISOR_TABS,
  [UserRole.BRANCH_MANAGER]: FULL,
  [UserRole.FINANCE_OFFICER]: FULL,
  [UserRole.HR_OFFICER]: FULL,
  [UserRole.PHYSICIAN]: ["patients", "encounters", "appointments", "operations", "doctor_revenue", "profile", "reports"],
  [UserRole.NURSE]: ["patients", "appointments", "encounters", "profile"],
  [UserRole.RECEPTIONIST]: ["patients", "appointments", "encounters", "operations", "profile"],
  [UserRole.CALL_CENTER]: ["patients", "appointments", "profile"],
  [UserRole.CLINIC_ADMIN]: [
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
  [UserRole.CLINIC_ASSISTANT]: ["patients", "appointments", "encounters", "operations", "expenses", "revenue", "profile"],
  [UserRole.PLATFORM_SUPER_ADMIN]: [
    "platform",
    "platform_organizations",
    "platform_users",
    "platform_clinics",
    "profile",
  ],
};

export function maxNavTabsForRole(role: UserRole): Set<string> {
  return new Set(ROLE_MAX[role] ?? FULL);
}

/** Union of every sidebar tab used by any tenant role (excludes platform-only tabs). */
const ORGANIZATION_NAV_TABS = new Set([...FULL, "doctor_revenue"]);

export function maxNavTabsForOrganization(): Set<string> {
  return ORGANIZATION_NAV_TABS;
}

export function organizationNavTabKeys(): string[] {
  return [...ORGANIZATION_NAV_TABS].sort((a, b) => a.localeCompare(b));
}

/** Global role defaults (before tenant override). */
export function defaultNavTabsForRole(role: UserRole): string[] {
  return [...maxNavTabsForRole(role)].sort((a, b) => a.localeCompare(b));
}

export function parseStoredNavTabKeys(raw: unknown): string[] | null {
  const arr = Array.isArray(raw) ? (raw as unknown[]).map((x) => String(x)) : [];
  return arr.length ? arr : null;
}

/** Tenant override when present; otherwise global role defaults. */
export function effectiveRoleNavTabs(role: UserRole, tenantGrant: string[] | null | undefined): string[] {
  if (tenantGrant?.length) return tenantGrant;
  return defaultNavTabsForRole(role);
}

/** Intersect requested keys with role max, enforce `profile`, drop unknown keys. */
export function sanitizeNavTabKeysForRole(role: UserRole, requested: string[], roleBase?: string[] | null): string[] {
  const max = roleBase?.length ? new Set(roleBase) : maxNavTabsForRole(role);
  const uniq = [...new Set(requested.map((k) => k.trim()).filter((k) => VALID_NAV_TAB_KEYS.has(k) && max.has(k)))];
  if (!uniq.includes("profile")) uniq.push("profile");
  return uniq.sort((a, b) => a.localeCompare(b));
}

export function isFullRoleNav(role: UserRole, keys: string[], roleBase?: string[] | null): boolean {
  const max = roleBase?.length ? new Set(roleBase) : maxNavTabsForRole(role);
  if (keys.length !== max.size) return false;
  return keys.every((k) => max.has(k));
}
