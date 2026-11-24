import { randomBytes } from "node:crypto";
import { LINK_CODE_PATTERN } from "../acquisition-contract";

/** Crockford base32 without I, L, O, U (ARCH 4.2). 32 symbols, so one random byte masked with 31 is exactly uniform. */
export const LINK_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LINK_CODE_LENGTH = 8;

export function generateLinkCode(random: (n: number) => Buffer = randomBytes): string {
  const bytes = random(LINK_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) out += LINK_CODE_ALPHABET[bytes[i]! & 31];
  return out;
}

/** Trims and upper-cases; null when the value is not a well-formed code (an unknown or malformed `s` is simply ignored by callers). */
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return LINK_CODE_PATTERN.test(code) ? code : null;
}
