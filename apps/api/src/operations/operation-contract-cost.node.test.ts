import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertOperationContractCost, isZeroCostAllowedForComplete } from "./operation-contract-cost";

describe("assertOperationContractCost", () => {
  it("allows positive total without contract", () => {
    assert.doesNotThrow(() =>
      assertOperationContractCost({ totalCost: 100, isContract: false }),
    );
  });

  it("allows zero when marked contract", () => {
    assert.doesNotThrow(() =>
      assertOperationContractCost({ totalCost: 0, isContract: true }),
    );
  });

  it("rejects zero without contract", () => {
    assert.throws(
      () => assertOperationContractCost({ totalCost: 0, isContract: false }),
      /OPERATION_CONTRACT_REQUIRED_FOR_ZERO_COST/,
    );
  });

  it("allows deferred zero without contract", () => {
    assert.doesNotThrow(() =>
      assertOperationContractCost({ totalCost: 0, isContract: false, feesDeferred: true }),
    );
  });
});

describe("isZeroCostAllowedForComplete", () => {
  it("allows complete only for contract zeros", () => {
    assert.equal(isZeroCostAllowedForComplete(0, true), true);
    assert.equal(isZeroCostAllowedForComplete(0, false), false);
    assert.equal(isZeroCostAllowedForComplete(10, false), false);
  });
});
