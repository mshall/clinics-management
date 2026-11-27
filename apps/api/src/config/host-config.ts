/**
 * THE ONE place where runtime host literals live (ADR-059, ENVIRONMENT_CONFIGURATION_STANDARD rule 1).
 *
 * These are the LEGACY DEFAULTS the live deployment has always used. Every one can be replaced by an environment variable generated from
 * `_docs/registry/service-url-registry.yaml` (`validate-registry.mjs --emit env`), and with no variable set every function returns the
 * same value the code used before this module existed, so a deployment that sets nothing behaves exactly as before.
 * `host-literals.node.test.ts` fails when a host literal appears in runtime code outside this file (and its short allow-list).
 *
 * Nothing here is a secret. Pure functions of an env object (testable, no process state captured at import time).
 */
import { PILOT_EMAIL_DOMAIN_DEFAULT, pilotEmailDomain } from "../staging/pilot-email-domain";

type Env = Record<string, string | undefined>;
export { pilotEmailDomain };

export const HOST_DEFAULTS = Object.freeze({
  /** Clinic web host used in links minted by the API when no explicit origin is configured. */
  clinicWebHost: "app.kiorly.com",
  /** Nurse edition web host (ADR-031). */
  nurseWebHost: "nurse.kiorly.com",
  /** Parent domains under which `nurse.<env>.<domain>` also means the Nurse edition. */
  nurseParentDomains: ["kiorly.com", "kiorly.link"] as readonly string[],
  /** Embeddable booking widget host (PROPOSED, NEEDS_HUMAN). */
  widgetBaseUrl: "https://book.kiorex.com",
  /** Domain of the staff / demo e-mail addresses (`physician@<domain>`), aliased to `@demo.clinic` at sign-in. */
  demoEmailDomain: "kiorly.com",
  /** Pilot (sales) tenant admin e-mail domain, staging seed only. */
  pilotEmailDomain: PILOT_EMAIL_DOMAIN_DEFAULT,
  /** SES sending domain for transactional mail. */
  mailSendingDomain: "mail.kiorly.com",
  /** Fallback payer e-mail for a PSP intention that has no customer e-mail. */
  noReplyAddress: "noreply@kiorly.com",
  /** Operator contact used as the Web Push VAPID subject. */
  opsContactAddress: "ops@kiorly.com",
  /** Public contact address on the marketing page. */
  contactAddress: "hello@kiorly.com",
  /** Frozen schema identifier base of Kiorex events (contracts keep it forever; never a deployment host). */
  eventSchemaBase: "https://schemas.kiorex.com",
});

const clean = (v: string | undefined): string => (v ?? "").trim();
const noSlash = (v: string): string => v.replace(/\/+$/, "");

/** Host (no scheme, no port) of an absolute URL; null when the value is not a URL. */
export function hostOfUrl(u: string | undefined): string | null {
  try { return new URL(clean(u)).hostname.toLowerCase() || null; } catch { return null; }
}

/** Origin the API puts into links that point at the Clinic web (referral, pay links). */
export function clinicWebOrigin(env: Env = process.env): string {
  return noSlash(clean(env.WEB_PUBLIC_ORIGIN) || `https://${HOST_DEFAULTS.clinicWebHost}`);
}

/** Pay-link base: `WEB_BASE_URL` is used as given (the previous behaviour, including an empty string); only an unset variable falls back. */
export function payLinkBase(env: Env = process.env): string {
  return env.WEB_BASE_URL ?? `https://${HOST_DEFAULTS.clinicWebHost}`;
}

/** Nurse edition host: hostname of `NURSE_WEB_URL` when set, else the legacy default. */
export function nurseWebHost(env: Env = process.env): string {
  return hostOfUrl(env.NURSE_WEB_URL) ?? HOST_DEFAULTS.nurseWebHost;
}

/** Clinic web host shown in the brand block: hostname of `APP_WEB_URL` / `WEB_PUBLIC_ORIGIN` when set, else the legacy default. */
export function clinicWebHost(env: Env = process.env): string {
  return hostOfUrl(env.WEB_PUBLIC_ORIGIN) ?? hostOfUrl(env.APP_WEB_URL) ?? HOST_DEFAULTS.clinicWebHost;
}

/** Parent domains for `nurse.<label>.<domain>` host detection: `NURSE_PARENT_DOMAINS` (comma separated) or the legacy pair. */
export function nurseParentDomains(env: Env = process.env): string[] {
  const l = clean(env.NURSE_PARENT_DOMAINS).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return l.length ? l : [...HOST_DEFAULTS.nurseParentDomains];
}

export function widgetBaseUrl(env: Env = process.env): string {
  return noSlash(clean(env.KIOREX_WIDGET_BASE_URL) || HOST_DEFAULTS.widgetBaseUrl);
}

export function demoEmailDomain(env: Env = process.env): string {
  return clean(env.DEMO_EMAIL_DOMAIN).toLowerCase() || HOST_DEFAULTS.demoEmailDomain;
}

export function mailSendingDomain(env: Env = process.env): string {
  return clean(env.EMAIL_SENDING_DOMAIN).toLowerCase() || HOST_DEFAULTS.mailSendingDomain;
}

export function defaultFromAddress(env: Env = process.env): string {
  return `noreply@${mailSendingDomain(env)}`;
}

export function noReplyAddress(env: Env = process.env): string {
  return clean(env.NOREPLY_ADDRESS) || HOST_DEFAULTS.noReplyAddress;
}

export function opsContactAddress(env: Env = process.env): string {
  return clean(env.OPS_CONTACT_ADDRESS) || HOST_DEFAULTS.opsContactAddress;
}

export const KX_SUBJECT_DELETED_EVENT = `${HOST_DEFAULTS.eventSchemaBase}/event/subject.deleted`;
