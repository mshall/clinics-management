import { UserRole } from "@prisma/client";

/** Must match `NavItemKey` in `apps/web/src/lib/nav-policy.ts`. */
export const VALID_NAV_TAB_KEYS = new Set([
  "dashboard",
  "patients",
  "encounters",
  "appointments",
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
  "clinics",
  "expenses",
  "revenue",
  "hr",
  "reports",
  "admin",
  "profile",
];

const ROLE_MAX: Record<UserRole, readonly string[]> = {
  [UserRole.GROUP_ADMIN]: FULL,
  [UserRole.BRANCH_MANAGER]: FULL,
  [UserRole.FINANCE_OFFICER]: FULL,
  [UserRole.HR_OFFICER]: FULL,
  [UserRole.PHYSICIAN]: ["patients", "encounters", "appointments", "doctor_revenue", "profile", "reports"],
  [UserRole.NURSE]: ["patients", "appointments", "encounters", "profile"],
  [UserRole.RECEPTIONIST]: ["patients", "appointments", "encounters", "profile"],
  [UserRole.CLINIC_ADMIN]: [
    "dashboard",
    "patients",
    "appointments",
    "encounters",
    "clinics",
    "expenses",
    "revenue",
    "hr",
    "reports",
    "admin",
    "profile",
  ],
  [UserRole.CLINIC_ASSISTANT]: ["patients", "appointments", "encounters", "profile"],
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
