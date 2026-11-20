import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Inline mirror of operation-stage-policy role sets so CI unit tests do not need Vite path aliases.
 * Keep in sync with operation-stage-policy.ts.
 */
type DemoRole =
  | "group_admin"
  | "group_supervisor"
  | "clinic_admin"
  | "branch_manager"
  | "clinic_assistant"
  | "receptionist"
  | "call_center"
  | "physician";

const OPERATION_STAGE1_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "branch_manager",
  "clinic_assistant",
]);

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

function canInitiateOperation(role: DemoRole | undefined, additionalRoles?: DemoRole[] | null): boolean {
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE1_ROLES);
}

function canEditOperationStage1(role: DemoRole | undefined, additionalRoles?: DemoRole[] | null): boolean {
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE1_ROLES);
}

function canEditOperationStage2(role: DemoRole | undefined, additionalRoles?: DemoRole[] | null): boolean {
  return roleOrAdditional(role, additionalRoles, OPERATION_STAGE2_ROLES);
}

function isCallCenterOnlyForOperations(
  role: DemoRole | undefined,
  additionalRoles?: DemoRole[] | null,
): boolean {
  return canEditOperationStage2(role, additionalRoles) && !canEditOperationStage1(role, additionalRoles);
}

describe("operation-stage-policy (role mirror)", () => {
  it("hides create for call center", () => {
    assert.equal(canInitiateOperation("call_center"), false);
    assert.equal(isCallCenterOnlyForOperations("call_center"), true);
  });

  it("allows group supervisor and clinic assistant to initiate", () => {
    assert.equal(canInitiateOperation("group_supervisor"), true);
    assert.equal(canInitiateOperation("clinic_assistant"), true);
    assert.equal(canEditOperationStage1("clinic_assistant"), true);
  });

  it("allows call center stage 2 only", () => {
    assert.equal(canEditOperationStage2("call_center"), true);
    assert.equal(canEditOperationStage1("call_center"), false);
  });

  it("honours additionalRoles", () => {
    assert.equal(canInitiateOperation("call_center", ["clinic_assistant"]), true);
  });
});
