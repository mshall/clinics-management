/**
 * Web-side host literals (ADR-059): the ONE allow-listed place in `apps/web/src` where a Kiorly host or address may appear.
 * Defaults are the legacy values; a build may replace them with `VITE_NURSE_WEB_HOST` / `VITE_CONTACT_EMAIL`.
 * Safe to import from node tests (no `import.meta.env` there): the lookup is optional-chained.
 */
const env = (): Record<string, string | undefined> => ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};

export const DEFAULT_NURSE_WEB_HOST = "nurse.kiorly.com";
export const DEFAULT_NURSE_PARENT_DOMAINS: readonly string[] = ["kiorly.com", "kiorly.link"];
export const DEFAULT_CONTACT_EMAIL = "hello@kiorly.com";

export const nurseWebHost = (): string => env().VITE_NURSE_WEB_HOST?.trim().toLowerCase() || DEFAULT_NURSE_WEB_HOST;
export const nurseParentDomains = (): readonly string[] => {
  const l = (env().VITE_NURSE_PARENT_DOMAINS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return l.length ? l : DEFAULT_NURSE_PARENT_DOMAINS;
};
export const contactEmail = (): string => env().VITE_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
