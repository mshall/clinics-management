import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import {
  assertCanInitiateOperation,
  assertMayApplyOperationUpdate,
  canEditOperationStage1,
  canEditOperationStage2,
  canInitiateOperation,
  updateTouchesStage1Fields,
} from "./operation-stage-roles";

function user(role: UserRole, additional: UserRole[] = []): JwtUser {
  return {
    userId: "u1",
    email: "t@example.com",
    role,
    additionalRoles: additional,
    tenantId: "t1",
  } as JwtUser;
}

describe("operation-stage-roles", () => {
  it("allows group supervisor and clinic assistant to initiate", () => {
    assert.equal(canInitiateOperation(user(UserRole.GROUP_SUPERVISOR)), true);
    assert.equal(canInitiateOperation(user(UserRole.CLINIC_ASSISTANT)), true);
    assert.equal(canInitiateOperation(user(UserRole.GROUP_ADMIN)), true);
  });

  it("blocks call center from initiating", () => {
    assert.equal(canInitiateOperation(user(UserRole.CALL_CENTER)), false);
    assert.throws(() => assertCanInitiateOperation(user(UserRole.CALL_CENTER)), ForbiddenException);
  });

  it("allows call center stage-2 but not stage-1", () => {
    const cc = user(UserRole.CALL_CENTER);
    assert.equal(canEditOperationStage1(cc), false);
    assert.equal(canEditOperationStage2(cc), true);
    assert.throws(
      () => assertMayApplyOperationUpdate(cc, { patientId: "p1" }),
      ForbiddenException,
    );
    assert.doesNotThrow(() => assertMayApplyOperationUpdate(cc, { comments: "prep done" }));
  });

  it("detects stage-1 field touches", () => {
    assert.equal(updateTouchesStage1Fields({ comments: "x" }), false);
    assert.equal(updateTouchesStage1Fields({ clinicianId: "d1" }), true);
    assert.equal(updateTouchesStage1Fields({ totalCost: 100 }), true);
  });

  it("honours additionalRoles for initiate", () => {
    const u = user(UserRole.CALL_CENTER, [UserRole.CLINIC_ASSISTANT]);
    assert.equal(canInitiateOperation(u), true);
    assert.equal(canEditOperationStage1(u), true);
  });
});
