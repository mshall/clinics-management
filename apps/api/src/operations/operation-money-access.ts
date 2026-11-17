import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";

/** Roles that see operation money org-wide (lists, summaries, all operations). */
const OPERATION_MONEY_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
]);

export function isOperationMoneyRole(role: UserRole | undefined): boolean {
  return role != null && OPERATION_MONEY_ROLES.has(role);
}

export function isOperationMoneyPrincipal(principal: JwtUser | undefined): boolean {
  if (!principal) return false;
  return hasAnyRoleInSet(principal, OPERATION_MONEY_ROLES);
}

/** Period / revenue summaries on the operations workspace. */
export function operationSummaryFinancialsVisible(role: UserRole | undefined): boolean {
  return isOperationMoneyRole(role);
}

/** Total, down payment, paid, and balance on a single operation row. */
export function operationFinancialsVisible(
  viewer: JwtUser | undefined,
  clinicianId: string,
): boolean {
  if (!viewer) return false;
  if (isOperationMoneyPrincipal(viewer)) return true;
  if (hasRole(viewer, UserRole.PHYSICIAN) && viewer.userId === clinicianId) return true;
  return false;
}

/** Creating or PATCHing fee fields on an operation. */
export function canEditOperationFees(viewer: JwtUser | undefined): boolean {
  return isOperationMoneyPrincipal(viewer);
}

export function isCallCenterRole(role: UserRole | undefined): boolean {
  return role === UserRole.CALL_CENTER || String(role) === "CALL_CENTER";
}