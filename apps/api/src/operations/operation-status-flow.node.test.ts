import assert from "node:assert/strict";
import { OperationStatus } from "@prisma/client";
import { describe, it } from "node:test";
import { assertOperationStatusTransition } from "./operation-status-flow";

describe("assertOperationStatusTransition", () => {
  it("allows single-step advance", () => {
    assert.doesNotThrow(() =>
      assertOperationStatusTransition(OperationStatus.BOOKED, OperationStatus.PRE_OP),
    );
  });

  it("rejects multi-step skip by default", () => {
    assert.throws(
      () => assertOperationStatusTransition(OperationStatus.BOOKED, OperationStatus.DISCHARGED),
      /Advance one stage/,
    );
  });

  it("allows multi-step skip when allowPipelineSkip is set", () => {
    assert.doesNotThrow(() =>
      assertOperationStatusTransition(OperationStatus.BOOKED, OperationStatus.DISCHARGED, {
        allowPipelineSkip: true,
      }),
    );
  });
});