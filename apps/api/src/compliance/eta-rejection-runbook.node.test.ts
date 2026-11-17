import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRejectionRunbookKey, ETA_REJECTION_RUNBOOK_KEYS } from "./eta-rejection-runbook";

describe("MN-04 ETA rejection runbook keys", () => {
  it("maps credentials and buyer-name patterns", () => {
    assert.equal(classifyRejectionRunbookKey({ failureClass: "credentials" }), "credentials");
    assert.equal(
      classifyRejectionRunbookKey({ errorMessage: "Buyer name required above 150,000 EGP" }),
      "buyer_name",
    );
    assert.ok(ETA_REJECTION_RUNBOOK_KEYS.length >= 6);
  });
});