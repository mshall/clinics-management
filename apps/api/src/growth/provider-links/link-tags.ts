/** Campaign and UTM tags on a provider link (GRW-P1-D1). Short tokens only: never free text that could carry patient data or markup. */
export const LINK_TAG_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "campaign"] as const;
export type LinkTagKey = (typeof LINK_TAG_KEYS)[number];
export type LinkTags = Partial<Record<LinkTagKey, string>>;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

export function sanitizeLinkTags(input: unknown): { ok: true; tags: LinkTags | null } | { ok: false; key: string } {
  if (input === undefined || input === null) return { ok: true, tags: null };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, key: "tags" };
  const out: LinkTags = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(LINK_TAG_KEYS as readonly string[]).includes(k)) return { ok: false, key: k };
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") return { ok: false, key: k };
    const value = v.trim().toLowerCase();
    if (!TAG_PATTERN.test(value)) return { ok: false, key: k };
    out[k as LinkTagKey] = value;
  }
  return { ok: true, tags: Object.keys(out).length ? out : null };
}

/** Default utm_source / utm_medium for a channel when the provider did not set them (so the Kiorex touch carries a channel). */
export function defaultTagsForChannel(channelKind: string): LinkTags {
  switch (channelKind) {
    case "QR_POSTER":
    case "QR_DESK":
      return { utm_source: "kiorly", utm_medium: "qr" };
    case "SOCIAL":
      return { utm_source: "kiorly", utm_medium: "social" };
    case "SMS":
      return { utm_source: "kiorly", utm_medium: "sms" };
    case "WHATSAPP_SHARE":
      return { utm_source: "kiorly", utm_medium: "whatsapp" };
    case "EMAIL_SIG":
      return { utm_source: "kiorly", utm_medium: "email" };
    case "GOOGLE_PROFILE":
      return { utm_source: "google", utm_medium: "profile" };
    default:
      return { utm_source: "kiorly", utm_medium: "link" };
  }
}

export function effectiveTags(channelKind: string, stored: unknown): LinkTags {
  const parsed = sanitizeLinkTags(stored);
  return { ...defaultTagsForChannel(channelKind), ...(parsed.ok && parsed.tags ? parsed.tags : {}) };
}
