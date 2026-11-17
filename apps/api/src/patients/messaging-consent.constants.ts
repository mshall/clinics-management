export const MESSAGING_CONSENT_TRANSACTIONAL = "TRANSACTIONAL";
export const MESSAGING_CONSENT_MARKETING = "MARKETING";

export type MessagingConsentPurpose =
  | typeof MESSAGING_CONSENT_TRANSACTIONAL
  | typeof MESSAGING_CONSENT_MARKETING;

export const MESSAGING_CONSENT_CHANNELS = ["WHATSAPP", "SMS"] as const;

/** Template keys classified as marketing (recall campaigns). */
const MARKETING_TEMPLATE_PREFIXES = ["recall_"];

export function resolveMessagingPurpose(templateKey: string | null | undefined): MessagingConsentPurpose {
  const key = templateKey?.trim().toLowerCase() ?? "";
  if (!key) return MESSAGING_CONSENT_TRANSACTIONAL;
  if (MARKETING_TEMPLATE_PREFIXES.some((p) => key.startsWith(p))) return MESSAGING_CONSENT_MARKETING;
  return MESSAGING_CONSENT_TRANSACTIONAL;
}

const STOP_KEYWORDS = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "optout",
  "opt-out",
  "إلغاء",
  "الغاء",
  "ايقاف",
  "إيقاف",
]);

export function isMessagingOptOutKeyword(text: string | null | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  if (STOP_KEYWORDS.has(normalized)) return true;
  if (STOP_KEYWORDS.has(raw)) return true;
  return false;
}

export function defaultConsentGranted(purpose: MessagingConsentPurpose): boolean {
  return purpose === MESSAGING_CONSENT_TRANSACTIONAL;
}