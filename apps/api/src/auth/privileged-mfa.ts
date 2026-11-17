import { UserRole } from "@prisma/client";
import type { RolePrincipal } from "../common/effective-roles";
import { effectiveRoles } from "../common/effective-roles";

/** Admin / finance roles that must enable TOTP MFA (enforced via PrivilegedMfaGuard). */
export const PRIVILEGED_MFA_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.PLATFORM_SUPER_ADMIN,
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.FINANCE_OFFICER,
]);

export function roleRequiresMfaEnrollment(role: UserRole): boolean {
  return PRIVILEGED_MFA_ROLES.has(role);
}

export function principalRequiresMfaEnrollment(principal: RolePrincipal): boolean {
  return effectiveRoles(principal).some((r) => roleRequiresMfaEnrollment(r));
}