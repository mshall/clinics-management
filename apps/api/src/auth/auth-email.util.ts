/** Shared email normalization for login and password reset. */

export function normalizeLoginEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function loginEmailLookupVariants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  if (normalized.endsWith("@kiorly.com")) {
    out.add(`${normalized.slice(0, -"@kiorly.com".length)}@demo.clinic`);
  }
  if (normalized.endsWith("@demo.clinic")) {
    out.add(`${normalized.slice(0, -"@demo.clinic".length)}@kiorly.com`);
  }
  return [...out];
}