import { mapApiRole, type DemoRole } from "@/lib/roles";

/** Roles that may create, update, and deactivate/reactivate employees in their organization. */
const EMPLOYEE_MANAGE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_admin",
  "hr_officer",
  "branch_manager",
]);

/** Roles that may archive (soft-delete) employees within their scope. */
const EMPLOYEE_ARCHIVE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_admin",
  "branch_manager",
  "hr_officer",
]);

export function canManageEmployees(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (EMPLOYEE_MANAGE_ROLES.has(raw as DemoRole)) return true;
  return EMPLOYEE_MANAGE_ROLES.has(mapApiRole(raw));
}

export function canArchiveEmployees(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (EMPLOYEE_ARCHIVE_ROLES.has(raw as DemoRole)) return true;
  return EMPLOYEE_ARCHIVE_ROLES.has(mapApiRole(raw));
}

/** @deprecated Use canArchiveEmployees */
export function canDeleteEmployees(role: string | DemoRole | undefined | null): boolean {
  return canArchiveEmployees(role);
}

export function isHrOfficerRole(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (raw === "hr_officer" || raw === "HR_OFFICER") return true;
  return mapApiRole(raw) === "hr_officer";
}
