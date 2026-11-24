/**
 * Kiorex front door (ADR-040): "Talk to us" leads and funnel markers are signed with KIOREX_LEAD_SIGNING_SECRET (the same value as
 * PARTNER_LEAD_SIGNING_SECRET on Kiorex; written by kiorex-platform scripts/setup-partner-lead-secret.sh). Outside production a fixed dev value is used.
 * This module only reports whether it is set: it never returns or logs the value.
 */
type Env = Record<string, string | undefined>;
export const MIN_PROD_LEAD_SECRET_LENGTH = 32;

export interface LeadSigningStatus { status: "configured" | "not configured" }

export function leadSigningStatus(env: Env = process.env): LeadSigningStatus {
  if (env.NODE_ENV !== "production") return { status: "configured" }; // dev default value
  return { status: (env.KIOREX_LEAD_SIGNING_SECRET ?? "").trim().length >= MIN_PROD_LEAD_SECRET_LENGTH ? "configured" : "not configured" };
}

/** Startup notice: the product keeps working without it ("Talk to us" reports the service as unavailable), so this warns instead of refusing to boot. */
export function warnIfLeadSigningMissing(log: (message: string) => void = (m) => console.warn(m), env: Env = process.env): void {
  if (leadSigningStatus(env).status === "not configured") log("lead signing: not configured (KIOREX_LEAD_SIGNING_SECRET missing or shorter than 32 characters); Kiorex 'Talk to us' stays unavailable until it is set.");
}
