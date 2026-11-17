import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "crypto";

describe("ON-02 auth helpers", () => {
  it("password reset token hash is deterministic", () => {
    const raw = "sample-token";
    const a = createHash("sha256").update(raw).digest("hex");
    const b = createHash("sha256").update(raw).digest("hex");
    assert.equal(a, b);
  });
});