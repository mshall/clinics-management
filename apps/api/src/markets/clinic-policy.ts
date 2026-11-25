/**
 * Provider-side policy numbers that used to be bare constants (configurability sweep). The Clinic has no maker-checker console of its own (Kiorex owns that), so these are
 * DEPLOYMENT settings: an environment variable, parsed and CLAMPED to a safe range, defaulting to exactly the value that shipped. An unparsable or out-of-range value falls back to
 * the default (never to an extreme), so a typo cannot shorten the telehealth window to nothing or hold a slot for a day.
 * Not here, on purpose (safety or legal): OTP limits, MFA grace, HMAC skew, upload size limits, price-change notice days.
 */
type Spec = { env: string; def: number; min: number; max: number; unit: string };
export const CLINIC_POLICY: Readonly<Record<"slotHoldMinutes" | "telehealthJoinOpensBeforeMinutes" | "telehealthJoinClosesAfterEndMinutes", Spec>> = {
  slotHoldMinutes: { env: "CLINIC_SLOT_HOLD_MINUTES", def: 5, min: 2, max: 15, unit: "minutes" },
  telehealthJoinOpensBeforeMinutes: { env: "CLINIC_TELEHEALTH_JOIN_OPENS_BEFORE_MINUTES", def: 10, min: 5, max: 30, unit: "minutes" },
  telehealthJoinClosesAfterEndMinutes: { env: "CLINIC_TELEHEALTH_JOIN_CLOSES_AFTER_END_MINUTES", def: 60, min: 15, max: 180, unit: "minutes" },
};
export function policyNumber(key: keyof typeof CLINIC_POLICY, env: Record<string, string | undefined> = process.env): number {
  const s = CLINIC_POLICY[key]; const raw = env[s.env];
  if (raw === undefined || raw.trim() === "") return s.def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= s.min && n <= s.max ? n : s.def;
}
