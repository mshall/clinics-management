import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeLinkCode } from "./link-code";

/**
 * Signed link-touch token `lt` (ARCH 4.2 and 6.4 rule 1): carries only `{org, link code, ts}`, no patient data, no visitor key.
 * Signed with the marketplace HMAC secret Kiorex already shares with the Clinic (`KIOREX_OUTBOX_WEBHOOK_SECRET`; `LINK_TOUCH_SIGNING_SECRET`
 * overrides it), domain-separated with the `kx-lt1` prefix so it can never be replayed as a request signature.
 * Kiorex verifies the same format; a revoked link stops being signed, and the Clinic re-checks the link at booking time.
 */
export const LINK_TOUCH_VERSION = 1;
export const LINK_TOUCH_DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;
const PREFIX = "kx-lt1\n";
const DEV_FALLBACK = "kx_dev_webhook_secret";

export interface LinkTouchClaims {
  /** Organisation (tenant) id. */
  o: string;
  /** Link code (8 Crockford characters). */
  c: string;
  /** Issued-at, epoch milliseconds. */
  t: number;
  v: 1;
}

export function linkTouchSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.LINK_TOUCH_SIGNING_SECRET?.trim() || env.KIOREX_OUTBOX_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  return env.NODE_ENV === "production" ? null : DEV_FALLBACK;
}

function sign(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret).update(PREFIX + payloadB64).digest("base64url");
}

export function signLinkTouch(input: { tenantId: string; code: string; now?: Date }, secret = linkTouchSecret()): string | null {
  if (!secret) return null;
  const code = normalizeLinkCode(input.code);
  if (!code) return null;
  const claims: LinkTouchClaims = { o: input.tenantId, c: code, t: (input.now ?? new Date()).getTime(), v: LINK_TOUCH_VERSION };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

export type LinkTouchVerdict = { ok: true; claims: LinkTouchClaims } | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "NO_SECRET" };

export function verifyLinkTouch(token: unknown, opts?: { now?: Date; ttlMs?: number; secret?: string | null }): LinkTouchVerdict {
  const secret = opts?.secret === undefined ? linkTouchSecret() : opts.secret;
  if (!secret) return { ok: false, reason: "NO_SECRET" };
  if (typeof token !== "string" || token.length > 600) return { ok: false, reason: "MALFORMED" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "MALFORMED" };
  const expected = Buffer.from(sign(secret, parts[0]));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "BAD_SIGNATURE" };
  let claims: LinkTouchClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as LinkTouchClaims;
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (!claims || claims.v !== LINK_TOUCH_VERSION || typeof claims.o !== "string" || typeof claims.t !== "number" || !normalizeLinkCode(claims.c)) {
    return { ok: false, reason: "MALFORMED" };
  }
  const now = (opts?.now ?? new Date()).getTime();
  const ttl = opts?.ttlMs ?? LINK_TOUCH_DEFAULT_TTL_MS;
  if (claims.t > now + 5 * 60 * 1000 || now - claims.t > ttl) return { ok: false, reason: "EXPIRED" };
  return { ok: true, claims };
}
