/** Stored inside ClinicianVerification.documentKeys JSON. */
export const VERIFICATION_DOCUMENT_KINDS = [
  "SYNDICATE_CARD",
  "SPECIALTY_CERTIFICATE",
  "CLINIC_LICENCE",
  "PROFILE_PHOTO",
  /** PRVER01 — Ministry of Health licence (physio / nurse / dentist). */
  "MOH_LICENCE",
  /** PRVER04 — solo practitioners: selfie holding the national ID (ops compares by eye; no biometric provider). */
  "ID_SELFIE",
  /** PRVER04 — criminal-record certificate (solo nurses; wording and retention: Q8, NEEDS_HUMAN). */
  "CRIMINAL_RECORD_CERT",
] as const;

export type VerificationDocumentKind = (typeof VERIFICATION_DOCUMENT_KINDS)[number];

export type VerificationDocumentRef = {
  kind: VerificationDocumentKind;
  relativePath: string;
  originalFileName: string;
  mimeType: string;
  uploadedAt: string;
};

export function parseVerificationDocuments(raw: unknown): VerificationDocumentRef[] {
  if (!Array.isArray(raw)) return [];
  const out: VerificationDocumentRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const kind = String(r.kind ?? "");
    if (!VERIFICATION_DOCUMENT_KINDS.includes(kind as VerificationDocumentKind)) continue;
    const relativePath = String(r.relativePath ?? "").trim();
    if (!relativePath) continue;
    out.push({
      kind: kind as VerificationDocumentKind,
      relativePath,
      originalFileName: String(r.originalFileName ?? "document"),
      mimeType: String(r.mimeType ?? "application/octet-stream"),
      uploadedAt: String(r.uploadedAt ?? new Date().toISOString()),
    });
  }
  return out;
}