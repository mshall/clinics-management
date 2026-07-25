import { UserRole } from "@prisma/client";

/** Roles that may create, update, and deactivate/reactivate employees. */
export const EMPLOYEE_MANAGE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.HR_OFFICER,
  UserRole.BRANCH_MANAGER,
]);

/** Roles that may archive (soft-delete) employees. */
export const EMPLOYEE_ARCHIVE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.HR_OFFICER,
]);

export function roleCanManageEmployees(role: UserRole): boolean {
  return EMPLOYEE_MANAGE_ROLES.has(role);
}

export function roleCanArchiveEmployees(role: UserRole): boolean {
  return EMPLOYEE_ARCHIVE_ROLES.has(role);
}

export function roleUsesHrProvisionerFlow(role: UserRole): boolean {
  return role === UserRole.HR_OFFICER;
}
