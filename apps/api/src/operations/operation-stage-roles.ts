import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRoleInSet } from "../common/effective-roles";
import type { UpdateOperationDto } from "./dto/update-operation.dto";

/**
 * Stage 1 (booking): patient, doctor, date/time, cost/down payment, acquisition.
 * Group supervisor + clinic (doctor) assistant initiate; org admins may also book.
 * Call center cannot initiate or edit stage-1 fields.
 */
export const OPERATION_STAGE1_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
]);

/**
 * Stage 2 (clinical prep): comments, lab/radiology/other documents, prescriptions/meds.
 * Includes call center (and receptionist) so they can complete prep without rebooking.
 */
export const OPERATION_STAGE2_ROLES: ReadonlySet<UserRole> = new Set([
  ...OPERATION_STAGE1_ROLES,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
]);

/** Roles that may POST a new operation (same as stage 1). */
export const OPERATION_INITIATE_ROLES = OPERATION_STAGE1_ROLES;

export function canInitiateOperation(user: JwtUser): boolean {
  return hasAnyRoleInSet(user, OPERATION_INITIATE_ROLES);
}

export function canEditOperationStage1(user: JwtUser): boolean {
  return hasAnyRoleInSet(user, OPERATION_STAGE1_ROLES);
}

export function canEditOperationStage2(user: JwtUser): boolean {
  return hasAnyRoleInSet(user, OPERATION_STAGE2_ROLES);
}

export function assertCanInitiateOperation(user: JwtUser): void {
  if (!canInitiateOperation(user)) {
    throw new ForbiddenException(
      "Only a group supervisor or doctor assistant can schedule a new operation",
    );
  }
}

export function assertCanEditOperationStage2(user: JwtUser): void {
  if (!canEditOperationStage2(user)) {
    throw new ForbiddenException("You do not have permission to update operation clinical details");
  }
}

/** Stage-1 booking fields on UpdateOperationDto. */
const STAGE1_UPDATE_KEYS: ReadonlyArray<keyof UpdateOperationDto> = [
  "patientId",
  "clinicianId",
  "operationDate",
  "totalCost",
  "downPayment",
  "isContract",
  "clinicId",
  "feeCurrency",
];

export function updateTouchesStage1Fields(dto: UpdateOperationDto): boolean {
  return STAGE1_UPDATE_KEYS.some((key) => dto[key] !== undefined);
}

export function assertMayApplyOperationUpdate(user: JwtUser, dto: UpdateOperationDto): void {
  const touchesStage1 = updateTouchesStage1Fields(dto);
  const touchesStage2 =
    dto.comments !== undefined || dto.noMedications !== undefined;

  if (!touchesStage1 && !touchesStage2) {
    // Empty / unrelated body — other endpoints handle docs/status.
    return;
  }

  if (touchesStage1 && !canEditOperationStage1(user)) {
    throw new ForbiddenException(
      "Only a group supervisor or doctor assistant can change booking details (patient, doctor, date, cost). Call center may update clinical prep only.",
    );
  }

  if (!canEditOperationStage2(user)) {
    throw new ForbiddenException("You do not have permission to update this operation");
  }
}
