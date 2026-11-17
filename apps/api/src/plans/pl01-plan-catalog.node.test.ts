import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isPlanPriceActive } from "./plans-active-prices";

describe("PL-01 plan price versioning", () => {
  it("active price window respects validFrom and validTo", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    assert.equal(
      isPlanPriceActive({ validFrom: new Date("2026-01-01"), validTo: null }, now),
      true,
    );
    assert.equal(
      isPlanPriceActive({ validFrom: new Date("2026-07-01"), validTo: null }, now),
      false,
    );
    assert.equal(
      isPlanPriceActive({ validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-01T12:00:00Z") }, now),
      false,
    );
    assert.equal(
      isPlanPriceActive({ validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-02T00:00:00Z") }, now),
      true,
    );
  });

  it("public plans HTTP handler sets cache-control", () => {
    const src = readFileSync(join(process.cwd(), "src/plans/public-plans.controller.ts"), "utf8");
    assert.ok(src.includes("Cache-Control"));
    assert.ok(src.includes("max-age=300"));
  });
});