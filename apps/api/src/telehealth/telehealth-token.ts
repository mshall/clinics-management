import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ADR-039 patient link token. HMAC-SHA256 over {sessionId, patientId, linkVersion}; deliberately NO times inside
 * (the join window is computed server-side at join) and no PHI. "Regenerate link" bumps linkVersion, which kills old tokens.
 * Key: TELEHEALTH_LINK_SECRET, else derived from the existing JWT signing secret (same secret source as auth; Secrets Manager injects it).
 */
export type TelehealthTokenClaims = { s: string; p: string; v: number };

function key(): Buffer {
  const own = process.env.TELEHEALTH_LINK_SECRET?.trim();
  let base = own;
  if (!base) {
    const raw = process.env.JWT_SECRET?.trim();
    if (!raw) throw new Error("JWT_SECRET (or TELEHEALTH_LINK_SECRET) is required for telehealth links");
    base = raw;
    if (raw.startsWith("{")) {
      try {
        const j = JSON.parse(raw) as { jwt?: string };
        if (j.jwt) base = j.jwt;
      } catch {
        /* raw */
      }
    }
    return createHmac("sha256", base).update("kiorly-telehealth-link-v1").digest();
  }
  return Buffer.from(base);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signTelehealthToken(c: TelehealthTokenClaims): string {
  const body = b64(JSON.stringify(c));
  return `${body}.${b64(createHmac("sha256", key()).update(body).digest())}`;
}

export function verifyTelehealthToken(token: string): TelehealthTokenClaims | null {
  const [body, sig, extra] = String(token ?? "").split(".");
  if (!body || !sig || extra !== undefined || token.length > 400) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TelehealthTokenClaims;
    if (typeof c.s !== "string" || typeof c.p !== "string" || !Number.isInteger(c.v)) return null;
    return c;
  } catch {
    return null;
  }
}

export function patientJoinUrl(session: { id: string; patientId: string; linkVersion: number }): string {
  const base = (process.env.APP_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:5174").replace(/\/+$/, "");
  return `${base}/v/${signTelehealthToken({ s: session.id, p: session.patientId, v: session.linkVersion })}`;
}
