import { mapApiRole, type DemoRole } from "@/lib/roles";

/** Roles that may create, update, and delete employees in their organization. */
const EMPLOYEE_MANAGE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_admin",
  "hr_officer",
  "branch_manager",
]);

export function canManageEmployees(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (EMPLOYEE_MANAGE_ROLES.has(raw as DemoRole)) return true;
  return EMPLOYEE_MANAGE_ROLES.has(mapApiRole(raw));
}
