// node --test infra/lambda/demo-seed   (offline; no AWS)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertAllowed, handler } from "./run.mjs";

describe("demo seed Lambda guard (Q10)", () => {
  it("refuses without DEMO_SEED_ALLOWED=true", () => {
    assert.throws(() => assertAllowed({ KIORLY_ENV: "staging" }), /DEMO_SEED_ALLOWED/);
  });
  it("refuses production and undeclared environments", () => {
    for (const e of ["prod", "production", "PROD", "live"]) assert.throws(() => assertAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: e }), /production/);
    assert.throws(() => assertAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: "staging", ENV_TAG: "prod" }), /production/);
    assert.throws(() => assertAllowed({ DEMO_SEED_ALLOWED: "true" }), /not declared/);
  });
  it("allows staging", () => {
    assert.doesNotThrow(() => assertAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: "staging" }));
  });
  it("the handler itself refuses (before touching AWS) when the guard fails", async () => {
    const keep = { ...process.env };
    try {
      process.env.DEMO_SEED_ALLOWED = "true"; process.env.KIORLY_ENV = "prod";
      await assert.rejects(handler({}), /production/);
      delete process.env.DEMO_SEED_ALLOWED;
      await assert.rejects(handler({}), /DEMO_SEED_ALLOWED/);
    } finally { process.env = keep; }
  });
});
