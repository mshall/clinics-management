import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { medianReviewDurationMs, slaBreached, waitingDurationMs } from "./verification-review-metrics";

describe("PA-03 verification review metrics", () => {
  it("medianReviewDurationMs returns middle sample", () => {
    assert.equal(medianReviewDurationMs([10_000, 30_000, 50_000]), 30_000);
    assert.equal(medianReviewDurationMs([10_000, 20_000, 30_000, 40_000]), 25_000);
    assert.equal(medianReviewDurationMs([]), null);
  });

  it("SLA breach flags waits beyond target hours", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const within = new Date("2026-01-02T12:00:00Z");
    const beyond = new Date("2026-01-04T00:00:00Z");
    assert.equal(slaBreached(start, 48, within), false);
    assert.equal(slaBreached(start, 48, beyond), true);
    assert.equal(waitingDurationMs(start, within), 36 * 60 * 60 * 1000);
  });
});