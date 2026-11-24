import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeFor, cleanEvidenceRefs, reVerifyOnLicenseChange } from "./verification-requests.service";

describe("GRW-P2-C verification update requests (pure parts)", () => {
  it("the badge stays during review, except for a pending licence-number change while the policy is on", () => {
    assert.equal(badgeFor([], true), "VERIFIED");
    assert.equal(badgeFor([{ field: "ADDRESS", status: "SUBMITTED" }], true), "VERIFIED");
    assert.equal(badgeFor([{ field: "PHOTO", status: "NEEDS_INFO" }], true), "VERIFIED");
    assert.equal(badgeFor([{ field: "LICENSE_NUMBER", status: "SUBMITTED" }], true), "UPDATE_UNDER_REVIEW");
    assert.equal(badgeFor([{ field: "LICENSE_NUMBER", status: "NEEDS_INFO" }], true), "UPDATE_UNDER_REVIEW");
    assert.equal(badgeFor([{ field: "LICENSE_NUMBER", status: "APPROVED" }], true), "VERIFIED");
    assert.equal(badgeFor([{ field: "LICENSE_NUMBER", status: "REJECTED" }], true), "VERIFIED");
    assert.equal(badgeFor([{ field: "LICENSE_NUMBER", status: "SUBMITTED" }], false), "VERIFIED");
  });
  it("the policy defaults to true and is switched off only by the literal false", () => {
    assert.equal(reVerifyOnLicenseChange({}), true);
    assert.equal(reVerifyOnLicenseChange({ GROWTH_REVERIFY_ON_LICENSE_CHANGE: "false" }), false);
    assert.equal(reVerifyOnLicenseChange({ GROWTH_REVERIFY_ON_LICENSE_CHANGE: "no" }), true);
  });
  it("evidence references are de-duplicated, bounded and shaped like file ids or paths", () => {
    assert.deepEqual(cleanEvidenceRefs(["a/b.pdf", "a/b.pdf", "x_1"]), ["a/b.pdf", "x_1"]);
    assert.deepEqual(cleanEvidenceRefs(undefined), []);
    assert.throws(() => cleanEvidenceRefs(["../etc/passwd "]), /Evidence references/);
    assert.throws(() => cleanEvidenceRefs(["javascript:alert(1)"]), /Evidence references/);
    assert.throws(() => cleanEvidenceRefs(Array.from({ length: 11 }, (_, i) => `f${i}`)), /At most 10/);
    assert.throws(() => cleanEvidenceRefs("x"), /list of file references/);
  });
});
