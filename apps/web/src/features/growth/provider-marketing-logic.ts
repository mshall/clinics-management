/** Pure helpers of the GRW-P2-C screens (no React), unit-tested in provider-marketing.node.test.ts. */
export const SHARE_CHANNEL_LABEL = ["WHATSAPP", "SMS", "COPY", "SHARE_SHEET", "DOWNLOAD"] as const;

/** One evidence reference per line, trimmed, de-duplicated, at most 10; mirrors the server shape check (the server stays the authority). */
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_./:-]{0,199}$/;
export function parseEvidence(text: string): { refs: string[]; invalid: string[] } {
  const refs: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    if (!REF_RE.test(s)) invalid.push(s);
    else if (!refs.includes(s)) refs.push(s);
  }
  if (refs.length > 10) invalid.push(...refs.splice(10));
  return { refs, invalid };
}

export const needsEvidence = (field: string) => field === "PHOTO" || field === "DOCUMENT";

/** wa.me link with the caption; never carries a recipient (the user picks the contact inside WhatsApp). */
export const whatsappUrl = (caption: string) => `https://wa.me/?text=${encodeURIComponent(caption)}`;
export const smsUrl = (caption: string) => `sms:?&body=${encodeURIComponent(caption)}`;

export function pngBlobUrl(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}

/** Month list (newest first) for the statement picker. */
export const recentMonths = (n: number, now = new Date()): string[] => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
});

export const slotLabelFor = (s: { labelEn: string; labelAr: string }, lang: string) => (lang.startsWith("ar") ? s.labelAr : s.labelEn);

/** The categories of a 422 CONTENT_NOT_ALLOWED response, in a stable order. */
export function refusedCategories(body: unknown): string[] {
  const f = (body as { findings?: Array<{ category?: string }> } | null)?.findings;
  return [...new Set((f ?? []).map((x) => x.category).filter((c): c is string => Boolean(c)))].sort();
}
export const errorCodeOf = (e: unknown): string | null => {
  const b = (e as { body?: { code?: string } } | null)?.body;
  return b?.code ?? null;
};
