import type { DemoRole } from "@/lib/roles";
import { canMutateOperations, type NavTabAccessMode } from "@/lib/nav-tab-access-policy";

/** Stage 1 booking: patient, doctor, date/time, cost, acquisition. */
const OPERATION_STAGE1_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "branch_manager",
  "clinic_assistant",
]);

/** Stage 2 clinical prep: comments, documents, prescriptions. */
const OPERATION_STAGE2_ROLES = new Set<DemoRole>([
  ...OPERATION_STAGE1_ROLES,
  "receptionist",
  "call_center",
]);

function roleOrAdditional(
  role: DemoRole | undefined,
  additionalRoles: DemoRole[] | null | undefined,
  allowed: ReadonlySet<DemoRole>,
): boolean {
  if (role && allowed.has(role)) return true;
  return Boolean(additionalRoles?.some((r) => allowed.has(r)));
}

/** May open “New operation” and fill stage-1 booking fields. */
export function canInitiateOperation(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
  additionalRoles?: DemoRole[] | null,
): boolean {
  if (!canMutateOperations(role, navTabKeys, navTabAccessModes)) return false;
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE1_ROLES);
}

export function canEditOperationStage1(
  role: DemoRole | undefined,
  additionalRoles?: DemoRole[] | null,
): boolean {
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE1_ROLES);
}

export function canEditOperationStage2(
  role: DemoRole | undefined,
  additionalRoles?: DemoRole[] | null,
): boolean {
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE2_ROLES);
}

export function isCallCenterOnlyForOperations(
  role: DemoRole | undefined,
  additionalRoles?: DemoRole[] | null,
): boolean {
  return canEditOperationStage2(role, additionalRoles) && !canEditOperationStage1(role, additionalRoles);
}
