import { mapApiRole, type DemoRole } from "@/lib/roles";

export type EmployeePrivilegeGrantSummary = {
  clinicId: string;
  canManageEmployees: boolean;
  canArchiveEmployees: boolean;
  hrProvisionLogin: boolean;
};

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

function hasDelegatedManage(grants?: EmployeePrivilegeGrantSummary[] | null): boolean {
  return grants?.some((g) => g.canManageEmployees) ?? false;
}

function hasDelegatedArchive(grants?: EmployeePrivilegeGrantSummary[] | null): boolean {
  return grants?.some((g) => g.canArchiveEmployees) ?? false;
}

function hasDelegatedHrProvisioner(grants?: EmployeePrivilegeGrantSummary[] | null): boolean {
  return grants?.some((g) => g.hrProvisionLogin) ?? false;
}

export function canManageEmployees(
  role: string | DemoRole | undefined | null,
  grants?: EmployeePrivilegeGrantSummary[] | null,
): boolean {
  if (hasDelegatedManage(grants)) return true;
  if (!role) return false;
  const raw = String(role).trim();
  if (EMPLOYEE_MANAGE_ROLES.has(raw as DemoRole)) return true;
  return EMPLOYEE_MANAGE_ROLES.has(mapApiRole(raw));
}

export function canArchiveEmployees(
  role: string | DemoRole | undefined | null,
  grants?: EmployeePrivilegeGrantSummary[] | null,
): boolean {
  if (hasDelegatedArchive(grants)) return true;
  if (!role) return false;
  const raw = String(role).trim();
  if (EMPLOYEE_ARCHIVE_ROLES.has(raw as DemoRole)) return true;
  return EMPLOYEE_ARCHIVE_ROLES.has(mapApiRole(raw));
}

/** @deprecated Use canArchiveEmployees */
export function canDeleteEmployees(
  role: string | DemoRole | undefined | null,
  grants?: EmployeePrivilegeGrantSummary[] | null,
): boolean {
  return canArchiveEmployees(role, grants);
}

export function isHrOfficerRole(
  role: string | DemoRole | undefined | null,
  grants?: EmployeePrivilegeGrantSummary[] | null,
): boolean {
  if (hasDelegatedHrProvisioner(grants)) return true;
  if (!role) return false;
  const raw = String(role).trim();
  if (raw === "hr_officer" || raw === "HR_OFFICER") return true;
  return mapApiRole(raw) === "hr_officer";
}

export function hasHrNavAccessFromGrants(grants?: EmployeePrivilegeGrantSummary[] | null): boolean {
  return hasDelegatedManage(grants) || hasDelegatedHrProvisioner(grants);
}
