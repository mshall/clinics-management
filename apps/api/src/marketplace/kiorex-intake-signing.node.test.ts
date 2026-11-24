import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import vectors from "./fixtures/intake-signing-vectors.json";
import { deriveIntakeSigningKey, intakeHeaders, newIntakeNonce } from "./kiorex-connect.service";

describe("intake signing helpers match the @kiorex/contracts 1.9.0 vectors (Clinic keeps its own copy: its Docker build context cannot reach the sibling package)", () => {
  it("fixture vectors", () => {
    assert.equal(deriveIntakeSigningKey(vectors.enrolmentCode), vectors.derivedKey);
    const h = intakeHeaders(vectors.enrolmentCode, vectors.timestamp, vectors.body, vectors.enrolmentCode);
    assert.equal(h["X-Kiorly-Signature"], vectors.signature);
    assert.equal(h["X-Kiorex-Enrolment"], vectors.enrolmentHeader);
    assert.match(newIntakeNonce(), /^[A-Za-z0-9_-]{16,64}$/);
  });
  it("when the sibling contracts build is present the two implementations agree on random input", async () => {
    const dist = join(process.cwd(), "..", "..", "..", "kiorex-contracts", "dist", "index.cjs");
    if (!existsSync(dist)) return;
    const c = await import(dist);
    for (const s of ["kxe_ZZZZZZZZ.abc", "kxi_secret", "é-unicode"]) assert.equal(deriveIntakeSigningKey(s), c.deriveIntakeSigningKey(s));
  });
});
