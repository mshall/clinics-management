import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Provider-neutral webhook signature check. Signature = HMAC-SHA256(secret, rawBody) as hex or base64, optionally
 * prefixed `sha256=`. When a timestamp header is supplied the signed string is `${timestamp}.${rawBody}` (Stripe style)
 * and replays older than `toleranceSec` are rejected. Fails closed when the secret or signature is missing.
 */
export function signWebhook(secret: string, rawBody: string, timestamp?: string): string {
  return createHmac("sha256", secret).update(timestamp ? `${timestamp}.${rawBody}` : rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(input: {
  secret: string | undefined;
  rawBody: string;
  signature: string | undefined;
  timestamp?: string;
  toleranceSec?: number;
  now?: number;
}): boolean {
  const secret = input.secret?.trim();
  const sig = input.signature?.trim().replace(/^sha256=/i, "");
  if (!secret || !sig) return false;
  if (input.timestamp) {
    const ts = Number(input.timestamp);
    const tsMs = ts > 1e12 ? ts : ts * 1000;
    const tolerance = (input.toleranceSec ?? 300) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs((input.now ?? Date.now()) - tsMs) > tolerance) return false;
  }
  const hex = signWebhook(secret, input.rawBody, input.timestamp);
  const candidates = [Buffer.from(hex, "utf8"), Buffer.from(Buffer.from(hex, "hex").toString("base64"), "utf8")];
  const given = Buffer.from(sig, "utf8");
  return candidates.some((c) => c.length === given.length && timingSafeEqual(c, given));
}
