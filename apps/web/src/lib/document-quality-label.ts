/** Format storage quality note for document lists (i18n keys only — no raw paths). */

export type DocumentQualityFields = {
  qualityNote?: string | null;
  sizeBytes: number;
  originalSizeBytes?: number | null;
  qualityUsed?: number | null;
  originalAvailable?: boolean;
};

const MB = 1024 * 1024;

export function documentQualityLabel(
  doc: DocumentQualityFields,
  t: (key: string, fallback: string) => string,
): string | null {
  const note = doc.qualityNote;
  if (!note) return null;
  if (note === "ORIGINAL_KEPT") {
    return t("patients.docQualityOriginalKept", "Original quality kept");
  }
  const mb = ((doc.sizeBytes || 0) / MB).toFixed(1);
  const q = doc.qualityUsed;
  // Interpolate locally so the helper stays compatible with simple `(key, fallback) => string` callers.
  const base =
    q != null
      ? t("patients.docQualityOptimisedWithQ", "Optimised to {{mb}} MB (quality {{q}})")
          .replace("{{mb}}", mb)
          .replace("{{q}}", String(q))
      : t("patients.docQualityOptimised", "Optimised to {{mb}} MB").replace("{{mb}}", mb);
  if (doc.originalAvailable) {
    return `${base} · ${t("patients.docQualityOriginalAvailable", "Original available")}`;
  }
  return base;
}
