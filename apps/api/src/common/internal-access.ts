import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * KX-PT-L2: who may see the DETAIL of `/health/ready` and `/health/providers` (provider modes, which vendors are wired, whether lead signing is configured).
 * The public answer of `/health/live` and of `/health/ready` stays minimal (status only). Detail is returned to
 *   1. a caller that presents `X-Health-Token` equal to `HEALTH_DETAIL_TOKEN` (constant-time compare; unset = this path is closed), or
 *   2. a caller that reaches the process directly from loopback or a private (RFC 1918 / ULA / link-local) address AND did not pass through a proxy
 *      (no `X-Forwarded-For` / `Forwarded`): a load balancer or sidecar inside the VPC, a developer on the same host. Anything arriving through the public
 *      edge carries a forwarded-for header, so the client-supplied header can only make the answer SMALLER, never larger.
 * Copy of this file lives in every Kiorex v2 API repo; change all copies together.
 */
type Req = { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function isPrivateAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const a = raw.replace(/^::ffff:/i, "").toLowerCase();
  const v = isIP(a);
  if (v === 4) {
    const [p, q] = a.split(".").map(Number);
    return p === 127 || p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 169 && q === 254);
  }
  if (v === 6) return a === "::1" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80");
  return false;
}

export function hasInternalHealthAccess(req: Req, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.HEALTH_DETAIL_TOKEN?.trim();
  const given = one(req.headers?.["x-health-token"]);
  if (expected && given && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return true;
  if (one(req.headers?.["x-forwarded-for"]) || one(req.headers?.["forwarded"])) return false;
  return isPrivateAddress(req.socket?.remoteAddress);
}
