import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertCanCreateGroupAdminRole } from "../common/group-admin-role-policy";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import type { JwtUser } from "../auth/jwt-user";

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
  isHrProvisioner: boolean,
): void {
  const hasLink = Boolean(userId?.trim());
  const hasLogin = Boolean(loginEmail?.trim() && loginPassword?.trim() && loginRole);
  if (isHrProvisioner) {
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

/** Linked organization group admins cannot be deactivated/archived via HR by HR officers, clinic admins, etc. */
export function assertHrCanDeactivateOrArchiveLinkedUser(
  viewer: Pick<JwtUser, "userId" | "email" | "role">,
  linkedUser: Pick<{ id: string; role: UserRole }, "id" | "role"> | null | undefined,
): void {
  if (!linkedUser || linkedUser.role !== UserRole.GROUP_ADMIN) return;
  if (isPlatformSuperAdmin(viewer)) return;
  if (viewer.role === UserRole.GROUP_ADMIN && viewer.userId !== linkedUser.id) return;
  throw new ForbiddenException(
    "Organization group administrators can only be deactivated or archived by another group administrator or platform super administrator",
  );
}

/** Group administrator employee HR records are read-only except for group administrators (and platform super admin). */
export function assertCanEditGroupAdminEmployeeProfile(
  viewer: Pick<JwtUser, "userId" | "email" | "role">,
  linkedUser: Pick<{ id: string; role: UserRole }, "id" | "role"> | null | undefined,
): void {
  if (!linkedUser || linkedUser.role !== UserRole.GROUP_ADMIN) return;
  if (isPlatformSuperAdmin(viewer)) return;
  if (viewer.role === UserRole.GROUP_ADMIN) return;
  throw new ForbiddenException(
    "Organization group administrator profiles can only be edited by a group administrator",
  );
}
