import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = "kiorly-clinician-pii-v1";

function resolveKey(): Buffer {
  const raw = process.env.CLINICIAN_PII_ENCRYPTION_KEY?.trim();
  if (raw) {
    const buf = Buffer.from(raw, raw.length >= 64 && /^[0-9a-f]+$/i.test(raw) ? "hex" : "base64");
    if (buf.length < 32) throw new Error("CLINICIAN_PII_ENCRYPTION_KEY must decode to at least 32 bytes");
    return buf.subarray(0, 32);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CLINICIAN_PII_ENCRYPTION_KEY is required in production");
  }
  return scryptSync("kiorly-dev-clinician-pii", SALT, 32);
}

export function encryptClinicianNationalId(plain: string): string {
  const text = plain.trim();
  if (!text) return "";
  const key = resolveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptClinicianNationalId(payload: string | null | undefined): string | null {
  if (!payload?.trim()) return null;
  const key = resolveKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}