import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRoleInSet } from "../common/effective-roles";
import type { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";
import { SUPPORT_MUTATE_ROLES, SUPPORT_VIEW_ROLES } from "../user-nav-tabs/nav-tab-module-roles";

const INSIGHTS_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.HR_OFFICER,
  UserRole.FINANCE_OFFICER,
]);

export async function assertSupportAccess(user: JwtUser, navTabAccess: NavTabAccessService): Promise<void> {
  if (!user.tenantId) throw new ForbiddenException("Tenant membership required");
  await navTabAccess.assertViewTab(
    user,
    "customer_support",
    SUPPORT_VIEW_ROLES,
    "You do not have access to customer support tools",
  );
}

export function assertInsightsAccess(user: JwtUser): void {
  if (!user.tenantId) throw new ForbiddenException("Tenant membership required");
  if (!hasAnyRoleInSet(user, INSIGHTS_ROLES)) {
    throw new ForbiddenException("Only organization administrators can view insights");
  }
}

export async function assertSupportMutate(user: JwtUser, navTabAccess: NavTabAccessService): Promise<void> {
  if (!user.tenantId) throw new ForbiddenException("Tenant membership required");
  await navTabAccess.assertMutateTab(
    user,
    "customer_support",
    SUPPORT_MUTATE_ROLES,
    "You do not have permission to change support tickets",
  );
}

export async function canUseSupport(user: JwtUser, navTabAccess: NavTabAccessService): Promise<boolean> {
  if (!user.tenantId) return false;
  try {
    await assertSupportAccess(user, navTabAccess);
    return true;
  } catch {
    return false;
  }
}