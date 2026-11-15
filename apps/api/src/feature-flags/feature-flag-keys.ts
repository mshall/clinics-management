/** Canonical feature flag keys — must match DB seeds and admin UI. */
export const FEATURE_FLAG_KEYS = [
  "ai_assistant",
  "eta_receipts",
  "whatsapp_reminders",
  "instapay",
  "fawry",
  "card_payments",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  eta_receipts: "Fiscal / ETA e-receipt queue and submit",
  whatsapp_reminders: "Outbound WhatsApp appointment reminders",
  instapay: "InstaPay transfer collection at check-in and billing",
  fawry: "Fawry transfer collection",
  card_payments: "Card payment allocation at cashier",
  ai_assistant: "In-product AI assistant (chat completions via market AiProvider)",
};

export function isKnownFeatureFlagKey(key: string): key is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(key);
}