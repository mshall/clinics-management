import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalFromSignedBody } from "./price-approval";

const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as { response?: { code?: string } }).response?.code ?? "ERR"; } };

describe("Kiorly admin price approval record (maker-checker)", () => {
  it("accepts a proposal id and a proposer other than the actor", () => {
    assert.deepEqual(approvalFromSignedBody({ proposalId: "kpp_abc123", proposedBy: "ops_1" }, "kiorly-admin:super_1"), { proposalId: "kpp_abc123", proposedBy: "ops_1" });
  });
  it("refuses a missing or malformed record", () => {
    for (const raw of [undefined, null, {}, { proposalId: "kpp_1" }, { proposedBy: "ops_1" }, { proposalId: "has space", proposedBy: "ops_1" }, { proposalId: "x".repeat(201), proposedBy: "ops_1" }, { proposalId: 5, proposedBy: "ops_1" }]) {
      assert.equal(code(() => approvalFromSignedBody(raw, "kiorly-admin:super_1")), "APPROVAL_REQUIRED");
    }
  });
  it("the proposer is never the approver", () => {
    assert.equal(code(() => approvalFromSignedBody({ proposalId: "kpp_1", proposedBy: "super_1" }, "kiorly-admin:super_1")), "TWO_PERSON_RULE");
  });
});
