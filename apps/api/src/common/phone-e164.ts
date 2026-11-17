import parsePhoneNumberFromString, { type CountryCode } from "libphonenumber-js";

/** Normalize to E.164 when valid; otherwise null so callers can fall back to digit matching. */
export function normalizePhoneToE164(phone: string, defaultCountry: CountryCode = "EG"): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (parsed?.isValid()) return parsed.format("E.164");
  const withPlus = raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`;
  const retry = parsePhoneNumberFromString(withPlus);
  if (retry?.isValid()) return retry.format("E.164");
  return null;
}