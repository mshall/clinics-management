import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

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
  if (isOperationMoneyRole(viewer.role)) return true;
  if (viewer.role === UserRole.PHYSICIAN && viewer.userId === clinicianId) return true;
  return false;
}

/** Creating or PATCHing fee fields on an operation. */
export function canEditOperationFees(viewer: JwtUser | undefined): boolean {
  return isOperationMoneyRole(viewer?.role);
}

export function isCallCenterRole(role: UserRole | undefined): boolean {
  return role === UserRole.CALL_CENTER || String(role) === "CALL_CENTER";
}