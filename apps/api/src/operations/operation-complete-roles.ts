import { ForbiddenException } from "@nestjs/common";
import { OperationStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { normalizeOperationStatus } from "./operation-status-flow";

/** Roles that may mark an operation completed / discharged (excludes call center). */
export const OPERATION_COMPLETE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.PHYSICIAN,
]);

export function operationStatusCompletesRevenue(status: OperationStatus): boolean {
  return (
    status === OperationStatus.COMPLETED ||
    status === OperationStatus.DISCHARGED ||
    normalizeOperationStatus(status) === OperationStatus.DISCHARGED
  );
}

export function assertCanCompleteOperation(viewer: JwtUser, status: OperationStatus): void {
  if (!operationStatusCompletesRevenue(status)) return;
  if (!OPERATION_COMPLETE_ROLES.has(viewer.role)) {
    throw new ForbiddenException("You do not have permission to mark operations as completed");
  }
}