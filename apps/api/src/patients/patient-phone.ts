/** Digits-only normalization for comparing phone numbers across formatting differences. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  return da.length >= 5 && da === db;
}

export const MIN_PHONE_DIGITS = 5;
