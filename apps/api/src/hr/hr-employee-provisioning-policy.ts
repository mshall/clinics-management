import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertCanCreateGroupAdminRole } from "../common/group-admin-role-policy";

/** Roles a clinic HR officer may assign when provisioning a login for a new employee. */
export const HR_ASSIGNABLE_USER_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.CLINIC_ASSISTANT,
]);

export type PhysicianAssignmentScope = "CLINIC" | "GROUP";

export function assertHrCanAssignLoginRole(role: UserRole): void {
  if (!HR_ASSIGNABLE_USER_ROLES.has(role)) {
    throw new ForbiddenException("HR officers may only assign clinic staff roles");
  }
  assertCanCreateGroupAdminRole(role);
}

export function assertProvisionLoginPayload(
  userId: string | undefined,
  loginEmail: string | undefined,
  loginPassword: string | undefined,
  loginRole: UserRole | undefined,
  viewerRole: UserRole,
): void {
  const hasLink = Boolean(userId?.trim());
  const hasLogin = Boolean(loginEmail?.trim() && loginPassword?.trim() && loginRole);
  if (viewerRole === UserRole.HR_OFFICER) {
    if (!hasLogin) {
      throw new BadRequestException("loginEmail, loginPassword, and loginRole are required for HR employee creation");
    }
    assertHrCanAssignLoginRole(loginRole!);
    return;
  }
  if (hasLink === hasLogin) {
    throw new BadRequestException("Provide either userId to link an existing login or loginEmail, loginPassword, and loginRole to create one");
  }
  if (hasLogin && loginRole) assertCanCreateGroupAdminRole(loginRole);
}
