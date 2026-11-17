import assert from "node:assert/strict";
import { test } from "node:test";
import { OperationStatus } from "@prisma/client";
import {
  operationAllowsPostSurgeryDocuments,
  operationStatusIsEditable,
} from "./operation-status-flow";

test("pre-op operations allow clinical document edit but not post-surgery upload", () => {
  assert.equal(operationStatusIsEditable(OperationStatus.PRE_OP), true);
  assert.equal(operationAllowsPostSurgeryDocuments(OperationStatus.PRE_OP), false);
});

test("discharged and legacy completed allow post-surgery documents", () => {
  assert.equal(operationAllowsPostSurgeryDocuments(OperationStatus.DISCHARGED), true);
  assert.equal(operationAllowsPostSurgeryDocuments(OperationStatus.COMPLETED), true);
});

test("in-progress pipeline stages block post-surgery upload", () => {
  assert.equal(operationAllowsPostSurgeryDocuments(OperationStatus.IN_PROGRESS), false);
  assert.equal(operationAllowsPostSurgeryDocuments(OperationStatus.RECOVERY), false);
});