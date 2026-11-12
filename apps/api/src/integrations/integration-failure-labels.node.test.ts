import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIntegrationOperationName, summarizeFailureReason } from "./integration-failure-labels";

describe("integration-failure-labels", () => {
  it("maps known operation codes", () => {
    assert.equal(formatIntegrationOperationName("BOOK_APPOINTMENT", "APPOINTMENT"), "Book appointment");
  });

  it("summarizes 401", () => {
    assert.equal(summarizeFailureReason(401, null, "Unauthorized"), "Integration token rejected");
  });
});
