import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTHED_READ_RATE, authRatePolicy, clearRateLimitStore, consumeRateLimit, LOGIN_RATE, OTP_RATE, PUBLIC_AUTH_RATE, rateLimitKey } from "./rate-limit";

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

  it("GET /auth/me is not throttled like a public auth route (a clinic behind one IP loads it on every page)", () => {
    assert.deepEqual(authRatePolicy("/api/v1/auth/me", "GET"), AUTHED_READ_RATE);
    assert.deepEqual(authRatePolicy("/api/v1/auth/sessions", "GET"), AUTHED_READ_RATE);
    assert.deepEqual(authRatePolicy("/api/v1/auth/me", "PATCH"), PUBLIC_AUTH_RATE);
    assert.deepEqual(authRatePolicy("/api/v1/auth/login", "POST"), LOGIN_RATE);
    assert.deepEqual(authRatePolicy("/api/v1/auth/otp/request", "POST"), OTP_RATE);
    assert.ok(AUTHED_READ_RATE.limit > PUBLIC_AUTH_RATE.limit);
  });
});
