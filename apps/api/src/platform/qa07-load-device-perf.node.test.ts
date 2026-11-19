import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(__dirname, "../../../..");

describe("QA-07 load & device performance", () => {
  it("k6 slots script targets 50 rps with p95 < 150 ms threshold", () => {
    const script = join(ROOT, "perf/k6/marketplace-slots-bookings.js");
    assert.equal(existsSync(script), true);
    const body = readFileSync(script, "utf8");
    assert.match(body, /rate:\s*50/);
    assert.match(body, /p\(95\)<150/);
  });

  it("node load harness dry-run passes", () => {
    const out = execFileSync(
      "node",
      [join(ROOT, "scripts/load-test-marketplace-slots.mjs")],
      { encoding: "utf8", env: { ...process.env, LOAD_TEST_DRY_RUN: "1" } },
    );
    assert.match(out, /PASS: dry-run/);
  });

  it("lighthouse mobile-4G budget keeps TTI ≤ 4 s", () => {
    const out = execFileSync("node", [join(ROOT, "scripts/lighthouse-budget-check.mjs")], {
      encoding: "utf8",
    });
    assert.match(out, /PASS: QA-07 lighthouse budget/);
    const budget = JSON.parse(readFileSync(join(ROOT, "perf/lighthouse/budget.json"), "utf8")) as Array<{
      timings: Array<{ metric: string; budget: number }>;
    }>;
    const interactive = budget[0]!.timings.find((t) => t.metric === "interactive")!;
    assert.ok(interactive.budget <= 4000);
  });

  it("engine slot p95 gate remains under 150 ms (KX-03)", () => {
    // Source guard: performance unit test must keep the launch SLO.
    const perfTest = readFileSync(join(ROOT, "apps/api/src/scheduling/kx03-slot-performance.node.test.ts"), "utf8");
    assert.match(perfTest, /p95 < 150/);
  });
});
