import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isZeroCostWithoutContract } from "./operation-form-validation";

describe("isZeroCostWithoutContract", () => {
  it("detects zero without contract for fee editors", () => {
    assert.equal(isZeroCostWithoutContract({ totalCost: "0", isContract: false }), true);
    assert.equal(isZeroCostWithoutContract({ totalCost: "0.00", isContract: false }), true);
  });

  it("allows zero when contract is checked", () => {
    assert.equal(isZeroCostWithoutContract({ totalCost: "0", isContract: true }), false);
  });

  it("ignores deferred fee roles and blank totals", () => {
    assert.equal(
      isZeroCostWithoutContract({ totalCost: "0", isContract: false, feesOptional: true }),
      false,
    );
    assert.equal(isZeroCostWithoutContract({ totalCost: "", isContract: false }), false);
    assert.equal(isZeroCostWithoutContract({ totalCost: "150", isContract: false }), false);
  });
});
