import { UserRole } from "@prisma/client";

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