import assert from "node:assert/strict";
import { test } from "node:test";
import { isDemoSeedBlockedInProduction } from "./seed-demo-guard";

test("production blocks demo seed by default", () => {
  const prev = process.env.NODE_ENV;
  const allow = process.env.ALLOW_DEMO_SEED;
  process.env.NODE_ENV = "production";
  delete process.env.ALLOW_DEMO_SEED;
  assert.equal(isDemoSeedBlockedInProduction(), true);
  process.env.ALLOW_DEMO_SEED = "true";
  assert.equal(isDemoSeedBlockedInProduction(), false);
  process.env.NODE_ENV = prev;
  if (allow === undefined) delete process.env.ALLOW_DEMO_SEED;
  else process.env.ALLOW_DEMO_SEED = allow;
});