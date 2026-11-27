/** Shared email normalization for login and password reset. */
import { demoEmailDomain } from "../config/host-config";

export function normalizeLoginEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function loginEmailLookupVariants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  const demo = `@${demoEmailDomain()}`;
  if (normalized.endsWith(demo)) {
    out.add(`${normalized.slice(0, -demo.length)}@demo.clinic`);
  }
  if (normalized.endsWith("@demo.clinic")) {
    out.add(`${normalized.slice(0, -"@demo.clinic".length)}${demo}`);
  }
  return [...out];
}
