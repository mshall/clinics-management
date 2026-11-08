import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

const SUPPORT_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.CALL_CENTER,
]);

const INSIGHTS_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
]);

export function assertSupportAccess(user: JwtUser): void {
  if (!user.tenantId) throw new ForbiddenException("Tenant membership required");
  if (!SUPPORT_ROLES.has(user.role)) {
    throw new ForbiddenException("You do not have access to customer support tools");
  }
}

export function assertInsightsAccess(user: JwtUser): void {
  if (!user.tenantId) throw new ForbiddenException("Tenant membership required");
  if (!INSIGHTS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only organization administrators can view insights");
  }
}

export function canUseSupport(user: JwtUser): boolean {
  return Boolean(user.tenantId && SUPPORT_ROLES.has(user.role));
}
