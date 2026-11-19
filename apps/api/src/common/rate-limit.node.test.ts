import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearRateLimitStore, consumeRateLimit, rateLimitKey } from "./rate-limit";

describe("SC-06 rate limit", () => {
  it("allows up to the limit then blocks with retryAfter", () => {
    clearRateLimitStore();
    const buckets = new Map();
    const key = rateLimitKey(["t", "login"]);
    for (let i = 0; i < 3; i++) {
      assert.equal(consumeRateLimit(key, 3, 60_000, 1_000 + i, buckets).ok, true);
    }
    const blocked = consumeRateLimit(key, 3, 60_000, 1_010, buckets);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
  });

  it("window expiry frees the bucket", () => {
    const buckets = new Map();
    const key = "k";
    assert.equal(consumeRateLimit(key, 1, 1000, 0, buckets).ok, true);
    assert.equal(consumeRateLimit(key, 1, 1000, 500, buckets).ok, false);
    assert.equal(consumeRateLimit(key, 1, 1000, 1001, buckets).ok, true);
  });
});
