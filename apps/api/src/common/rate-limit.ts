/** SC-06 — in-memory sliding-window rate limiter for public/auth routes. */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type Bucket = { timestamps: number[] };

const store = new Map<string, Bucket>();

export function rateLimitKey(parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p ?? "").trim() || "-").join("|");
}

/**
 * Allow at most `limit` events in `windowMs` for `key`.
 * Pure enough for unit tests — pass `now` / custom `map` in tests.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  buckets: Map<string, Bucket> = store,
): RateLimitResult {
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  bucket.timestamps.push(now);
  return { ok: true };
}

/** Public signup / auth defaults (per IP). */
export const PUBLIC_AUTH_RATE = { limit: 30, windowMs: 60_000 } as const;
export const LOGIN_RATE = { limit: 20, windowMs: 60_000 } as const;
export const OTP_RATE = { limit: 10, windowMs: 60_000 } as const;

/** Test helper — clear global store. */
export function clearRateLimitStore(): void {
  store.clear();
}
