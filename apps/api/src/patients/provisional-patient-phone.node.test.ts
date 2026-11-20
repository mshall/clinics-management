import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ProvisionalPatientService phone uniqueness", () => {
  const src = readFileSync(join(__dirname, "provisional-patient.service.ts"), "utf8");

  it("rejects duplicate phone with PHONE_IN_USE instead of silently reusing", () => {
    assert.match(src, /code:\s*"PHONE_IN_USE"/);
    assert.match(src, /existingPatient/);
    assert.doesNotMatch(src, /return\s*\{\s*patientId:\s*existing/);
  });

  it("maps conflict patient fields for the rich UI dialog", () => {
    assert.match(src, /profileComplete/);
    assert.match(src, /createdAt/);
    assert.match(src, /dob/);
  });
});
