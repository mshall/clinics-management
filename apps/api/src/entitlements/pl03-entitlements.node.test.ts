import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entitlementLimit, entitlementTruthy } from "./entitlement-value";
describe("PL-03 entitlement values", () => {
  it("truthy and limit parsing", () => {
    assert.equal(entitlementTruthy(false), false);
    assert.equal(entitlementTruthy(0), false);
    assert.equal(entitlementTruthy(2), true);
    assert.equal(entitlementLimit(5), 5);
    assert.equal(entitlementLimit(-1), -1);
  });
});