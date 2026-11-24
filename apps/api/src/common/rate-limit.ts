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

/** Authenticated session reads (GET /auth/me, sessions): JWT-guarded, hit on every page load by every staff member behind one clinic NAT/IP, so not a credential-guessing surface. */
export const AUTHED_READ_RATE = { limit: 600, windowMs: 60_000 } as const;

/** Pick the per-IP policy for an /auth/* request. Pure, unit-tested. */
export function authRatePolicy(path: string, method = "GET"): { limit: number; windowMs: number } {
  if (path.includes("/otp") || path.includes("/signup/verify") || path.includes("/password/forgot") || path.includes("/mfa/whatsapp/challenge")) return OTP_RATE;
  if (path.includes("/auth/login") || path.includes("/auth/handoff/login") || path.includes("/auth/refresh") || path.includes("/signup/complete")) return LOGIN_RATE;
  if (method.toUpperCase() === "GET" && (/\/auth\/me$/.test(path) || /\/auth\/sessions$/.test(path))) return AUTHED_READ_RATE;
  return PUBLIC_AUTH_RATE;
}

/** Online password guessing is limited per ACCOUNT as well as per IP (an attacker rotating IPs / forged forwarding headers shares one bucket per e-mail). */
export const LOGIN_ACCOUNT_RATE = { limit: 20, windowMs: 15 * 60_000 } as const;
export function isLoginPath(path: string): boolean {
  return path.includes("/auth/login") || path.includes("/auth/handoff/login");
}

/** Test helper — clear global store. */
export function clearRateLimitStore(): void {
  store.clear();
}
