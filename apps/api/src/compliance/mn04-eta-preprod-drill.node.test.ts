import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/** MN-04 / ETA_RECEIPT_V12 billing go-live checklist — enforced via existing unit tests. */
const PREPROD_DRILL_TESTS = [
  "compliance/eta-sdk-golden-fixture.node.test.ts",
  "compliance/eta-wired-hash.node.test.ts",
  "compliance/void-revenue-fiscal-returns.node.test.ts",
  "compliance/eta-submit-classify.node.test.ts",
  "compliance/fiscal-idempotency.node.test.ts",
  "compliance/fiscal-requeue.integration.test.ts",
] as const;

describe("MN-04 ETA pre-production billing drill coverage", () => {
  for (const rel of PREPROD_DRILL_TESTS) {
    it(`includes drill test ${rel}`, () => {
      const path = join(process.cwd(), "src", rel);
      assert.ok(existsSync(path), `Missing drill test ${rel}`);
    });
  }
});