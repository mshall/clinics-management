import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptClinicianNationalId, encryptClinicianNationalId } from "./field-crypto";

describe("ON-03 clinician PII crypto", () => {
  it("round-trips national ID in dev mode", () => {
    const plain = "29901011234567";
    const enc = encryptClinicianNationalId(plain);
    assert.notEqual(enc, plain);
    assert.equal(decryptClinicianNationalId(enc), plain);
  });

  it("returns null for empty ciphertext", () => {
    assert.equal(decryptClinicianNationalId(""), null);
    assert.equal(decryptClinicianNationalId(undefined), null);
  });
});