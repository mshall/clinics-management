import { UserRole } from "@prisma/client";

/** Roles that may correct completed operations (including physician reassignment). */
export const OPERATIONS_ADMIN_EDIT_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

export function canAdminEditCompletedOperation(role: UserRole): boolean {
  return OPERATIONS_ADMIN_EDIT_ROLES.has(role);
}
