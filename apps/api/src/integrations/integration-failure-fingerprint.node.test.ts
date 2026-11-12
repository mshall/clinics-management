import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeIntegrationFailureFingerprint } from "./integration-failure-fingerprint";

describe("computeIntegrationFailureFingerprint", () => {
  it("is stable for the same inputs", () => {
    const input = {
      tenantId: "t1",
      integrationClientId: "c1",
      operation: "BOOK_APPOINTMENT",
      statusCode: 400,
      reason: "Patient not found",
    };
    const a = computeIntegrationFailureFingerprint(input);
    const b = computeIntegrationFailureFingerprint(input);
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it("changes when status code changes", () => {
    const base = {
      tenantId: "t1",
      integrationClientId: "c1",
      operation: "BOOK_APPOINTMENT",
      statusCode: 400,
      reason: "Patient not found",
    };
    const a = computeIntegrationFailureFingerprint(base);
    const b = computeIntegrationFailureFingerprint({ ...base, statusCode: 404 });
    assert.notEqual(a, b);
  });
});
