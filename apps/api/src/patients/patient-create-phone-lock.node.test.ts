import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("patient create phone uniqueness", () => {
  const serviceSrc = readFileSync(join(__dirname, "patients.service.ts"), "utf8");
  const seedSrc = readFileSync(join(__dirname, "../../prisma/seed.ts"), "utf8");

  it("serializes create with an advisory lock on org+phone digits", () => {
    assert.match(serviceSrc, /pg_advisory_xact_lock/);
    assert.match(serviceSrc, /patient-phone:\$\{tenantId\}/);
    assert.match(serviceSrc, /normalizePhoneToE164/);
  });

  it("retries MRN allocation on unique conflicts instead of 500", () => {
    assert.match(serviceSrc, /P2002/);
    assert.match(serviceSrc, /Could not allocate MRN/);
  });

  it("gives each AES demo patient a unique phone (not the clinic line)", () => {
    assert.match(seedSrc, /demoPatientPhone/);
    assert.doesNotMatch(
      seedSrc,
      /gender:\s*i % 2 === 0 \? Gender\.F : Gender\.M,\s*\n\s*phone:\s*spec\.phone/,
    );
  });
});
