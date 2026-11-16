import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { OperationStatus } from "@prisma/client";
import { test } from "node:test";
import { assertDownPaymentBeforeInProgress } from "./operation-status-money";

test("in progress requires a down payment", () => {
  assert.throws(
    () => assertDownPaymentBeforeInProgress({ downPayment: 0 }, OperationStatus.IN_PROGRESS),
    (e: unknown) => e instanceof BadRequestException,
  );
  assert.doesNotThrow(() => assertDownPaymentBeforeInProgress({ downPayment: 0 }, OperationStatus.PRE_OP));
  assert.doesNotThrow(() => assertDownPaymentBeforeInProgress({ downPayment: 100 }, OperationStatus.IN_PROGRESS));
});