import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { VisitAddress } from "./visit-address";

/**
 * HVPRV01 — AES-256-GCM encryption of the home address at rest (HomeVisit.addressCiphertext, SlotHold.visitAddressCiphertext).
 * Key: HOME_VISIT_ADDRESS_ENCRYPTION_KEY (32 bytes, hex or base64); required in production, a fixed dev key otherwise.
 * Ciphertext = base64(iv | tag | data). The tenant id is bound in as AAD so a ciphertext copied to another tenant's row fails to decrypt.
 */
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = "kiorly-home-visit-address-v1";

function resolveKey(): Buffer {
  const raw = process.env.HOME_VISIT_ADDRESS_ENCRYPTION_KEY?.trim();
  if (raw) {
    const buf = Buffer.from(raw, raw.length >= 64 && /^[0-9a-f]+$/i.test(raw) ? "hex" : "base64");
    if (buf.length < 32) throw new Error("HOME_VISIT_ADDRESS_ENCRYPTION_KEY must decode to at least 32 bytes");
    return buf.subarray(0, 32);
  }
  if (process.env.NODE_ENV === "production") throw new Error("HOME_VISIT_ADDRESS_ENCRYPTION_KEY is required in production");
  return scryptSync("kiorly-dev-home-visit-address", SALT, 32);
}

export function encryptVisitAddress(address: VisitAddress, tenantId: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, resolveKey(), iv);
  cipher.setAAD(Buffer.from(tenantId, "utf8"));
  const enc = Buffer.concat([cipher.update(JSON.stringify(address), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptVisitAddress(payload: string | null | undefined, tenantId: string): VisitAddress | null {
  if (!payload?.trim()) return null;
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) return null;
  try {
    const decipher = createDecipheriv(ALGO, resolveKey(), buf.subarray(0, IV_LEN));
    decipher.setAAD(Buffer.from(tenantId, "utf8"));
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
    const json = Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString("utf8");
    return JSON.parse(json) as VisitAddress;
  } catch {
    return null;
  }
}
