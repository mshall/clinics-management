import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole, isTenantOwnerPrincipal } from "../common/effective-roles";

export function assertSubscriptionBillingAccess(user: JwtUser): void {
  if (
    isTenantOwnerPrincipal(user) ||
    hasRole(user, UserRole.GROUP_ADMIN) ||
    hasRole(user, UserRole.FINANCE_OFFICER)
  ) {
    return;
  }
  throw new ForbiddenException("Only organization owners, group admins, or finance can manage the subscription");
}