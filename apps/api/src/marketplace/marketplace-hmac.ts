import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MARKETPLACE_HMAC_MAX_SKEW_MS = 5 * 60 * 1000;

export function marketplaceCanonicalString(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodySha256: string;
}): string {
  return `${input.timestamp}\n${input.nonce}\n${input.method.toUpperCase()}\n${input.path}\n${input.bodySha256}`;
}

export function signMarketplaceRequest(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("base64url");
}

export function verifyMarketplaceSignature(secret: string, canonical: string, signature: string): boolean {
  const expected = signMarketplaceRequest(secret, canonical);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sha256BodyHex(body: Buffer | undefined): string {
  const h = createHash("sha256");
  if (body?.length) h.update(body);
  return h.digest("hex");
}