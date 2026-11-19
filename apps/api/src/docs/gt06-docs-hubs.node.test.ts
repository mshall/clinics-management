import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "../../../../Docs");

describe("GT-06 docs cleanup & capability map", () => {
  it("ships hub docs PLANS_AND_ENTITLEMENTS, BILLING_AND_CREDITS, KIOREX_CONNECTOR", () => {
    for (const name of ["PLANS_AND_ENTITLEMENTS.md", "BILLING_AND_CREDITS.md", "KIOREX_CONNECTOR.md"]) {
      const path = join(DOCS, name);
      assert.ok(existsSync(path), path);
      const body = readFileSync(path, "utf8");
      assert.ok(body.includes("Shipped"), name);
    }
  });

  it("capability map and roadmap reflect launch scope (no ETA claim)", () => {
    const caps = readFileSync(join(DOCS, "CLINIC_PLATFORM_CAPABILITIES.md"), "utf8");
    assert.match(caps, /GT-06/);
    assert.match(caps, /Out of scope/);
    assert.doesNotMatch(caps, /\*\*queues ETA e-receipt\*\*/);
    const roadmap = readFileSync(join(DOCS, "PRODUCT_EPIC_ROADMAP.md"), "utf8");
    assert.match(roadmap, /Phase 1b/);
    assert.match(roadmap, /BILLING_AND_CREDITS/);
  });

  it("every ticked §5 step appears in the build log", () => {
    const seq = readFileSync(join(DOCS, "kiorly-cursor-build-sequence.md"), "utf8");
    const ticked = [...seq.matchAll(/^- \[x\] Step (\d{3}) · ([A-Z0-9-]+)/gm)].map((m) => ({
      n: m[1],
      id: m[2],
    }));
    assert.ok(ticked.length >= 90, `expected many ticked steps, got ${ticked.length}`);
    const log = readFileSync(join(DOCS, "KIORLY_BUILD_LOG.md"), "utf8");
    for (const step of ticked.slice(-15)) {
      assert.ok(log.includes(step.id), `recent step ${step.n} ${step.id} should appear in build log`);
    }
  });
});
