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

/** Intersect requested keys with role max, enforce `profile`, drop unknown keys. */
export function sanitizeNavTabKeysForRole(role: UserRole, requested: string[]): string[] {
  const max = maxNavTabsForRole(role);
  const uniq = [...new Set(requested.map((k) => k.trim()).filter((k) => VALID_NAV_TAB_KEYS.has(k) && max.has(k)))];
  if (!uniq.includes("profile")) uniq.push("profile");
  return uniq.sort((a, b) => a.localeCompare(b));
}

export function isFullRoleNav(role: UserRole, keys: string[]): boolean {
  const max = maxNavTabsForRole(role);
  if (keys.length !== max.size) return false;
  return keys.every((k) => max.has(k));
}
