import { UserRole } from "@prisma/client";
import type { RolePrincipal } from "../common/effective-roles";
import { effectiveRoles } from "../common/effective-roles";

/** Owner / admin / finance roles that must enable MFA (SC-04; enforced via PrivilegedMfaGuard). */
export const PRIVILEGED_MFA_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.PLATFORM_SUPER_ADMIN,
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.FINANCE_OFFICER,
]);

/** Physicians may use WhatsApp OTP as a second factor (password login) in addition to TOTP. */
export function physicianMayUseWhatsAppMfa(principal: RolePrincipal): boolean {
  return effectiveRoles(principal).includes(UserRole.PHYSICIAN);
}

export function roleRequiresMfaEnrollment(role: UserRole): boolean {
  return PRIVILEGED_MFA_ROLES.has(role);
}

export function principalRequiresMfaEnrollment(principal: RolePrincipal): boolean {
  return effectiveRoles(principal).some((r) => roleRequiresMfaEnrollment(r));
}