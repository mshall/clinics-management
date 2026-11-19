import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agingBucket, bucketAgingLines } from "./ar-aging";

describe("RP-04 AR aging buckets", () => {
  it("assigns days into 0-30 / 31-60 / 61-90 / 90+ buckets", () => {
    const asOf = new Date("2026-11-19T00:00:00Z");
    assert.equal(agingBucket(asOf, new Date("2026-11-01T00:00:00Z")), "b0_30");
    assert.equal(agingBucket(asOf, new Date("2026-10-01T00:00:00Z")), "b31_60");
    assert.equal(agingBucket(asOf, new Date("2026-09-01T00:00:00Z")), "b61_90");
    assert.equal(agingBucket(asOf, new Date("2026-07-01T00:00:00Z")), "b90_plus");
  });

  it("bucket totals equal the sum of open amounts (reconcile)", () => {
    const asOf = new Date("2026-11-19T00:00:00Z");
    const lines = [
      { amountOpen: 100, asOf, issuedAt: new Date("2026-11-10T00:00:00Z") },
      { amountOpen: 200, asOf, issuedAt: new Date("2026-10-10T00:00:00Z") },
      { amountOpen: 50, asOf, issuedAt: new Date("2026-08-01T00:00:00Z") },
    ];
    const { buckets, total } = bucketAgingLines(lines, asOf);
    assert.equal(total, 350);
    assert.equal(buckets.b0_30 + buckets.b31_60 + buckets.b61_90 + buckets.b90_plus, total);
  });
});
