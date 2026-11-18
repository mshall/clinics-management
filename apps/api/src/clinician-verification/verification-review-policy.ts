/** PA-03: platform verification review SLA and checklist. */
export const VERIFICATION_REVIEW_SLA_HOURS = 48;

export const VERIFICATION_REVIEW_CHECKLIST_KEYS = [
  "syndicate_card",
  "specialty_match",
  "national_id_present",
  "documents_readable",
] as const;

export type VerificationReviewChecklistKey = (typeof VERIFICATION_REVIEW_CHECKLIST_KEYS)[number];

export const VERIFICATION_REJECT_REASON_CODES = [
  "ILLEGIBLE_DOCUMENTS",
  "SYNDICATE_MISMATCH",
  "SPECIALTY_MISMATCH",
  "INCOMPLETE_SUBMISSION",
  "OTHER",
] as const;

export type VerificationRejectReasonCode = (typeof VERIFICATION_REJECT_REASON_CODES)[number];

export const VERIFICATION_REJECT_REASON_LABELS: Record<
  VerificationRejectReasonCode,
  { en: string; ar: string }
> = {
  ILLEGIBLE_DOCUMENTS: {
    en: "Uploaded documents are illegible or expired.",
    ar: "المستندات المرفوعة غير واضحة أو منتهية الصلاحية.",
  },
  SYNDICATE_MISMATCH: {
    en: "Syndicate card does not match the syndicate number provided.",
    ar: "بطاقة النقابة لا تطابق رقم النقابة المدخل.",
  },
  SPECIALTY_MISMATCH: {
    en: "Specialty certificate does not match the declared specialty.",
    ar: "شهادة التخصص لا تطابق التخصص المعلن.",
  },
  INCOMPLETE_SUBMISSION: {
    en: "Required documents or fields are missing.",
    ar: "مستندات أو حقول مطلوبة ناقصة.",
  },
  OTHER: {
    en: "Other (see reviewer note).",
    ar: "سبب آخر (راجع ملاحظة المراجع).",
  },
};

export function composeRejectReason(code: VerificationRejectReasonCode, note?: string | null): string {
  const base = VERIFICATION_REJECT_REASON_LABELS[code].en;
  const trimmed = note?.trim();
  if (!trimmed || code === "OTHER") return trimmed || base;
  return `${base} ${trimmed}`;
}

export function missingReviewChecklistKeys(checklist: string[] | undefined): VerificationReviewChecklistKey[] {
  const set = new Set(checklist ?? []);
  return VERIFICATION_REVIEW_CHECKLIST_KEYS.filter((k) => !set.has(k));
}