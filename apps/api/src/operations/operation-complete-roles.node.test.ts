import assert from "node:assert/strict";
import { test } from "node:test";
import { OperationStatus, UserRole } from "@prisma/client";
import { assertCanCompleteOperation } from "./operation-complete-roles";

const receptionist = {
  userId: "r1",
  tenantId: "t1",
  email: "r@test.com",
  role: UserRole.RECEPTIONIST,
};

const callCenter = {
  userId: "c1",
  tenantId: "t1",
  email: "c@test.com",
  role: UserRole.CALL_CENTER,
};

test("call center cannot mark operation completed", () => {
  assert.throws(
    () => assertCanCompleteOperation(callCenter, OperationStatus.COMPLETED),
    /permission to mark operations as completed/,
  );
});

test("receptionist may mark operation completed", () => {
  assert.doesNotThrow(() => assertCanCompleteOperation(receptionist, OperationStatus.COMPLETED));
});

test("call center may cancel operation", () => {
  assert.doesNotThrow(() => assertCanCompleteOperation(callCenter, OperationStatus.CANCELLED));
});