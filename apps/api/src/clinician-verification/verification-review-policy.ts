/** PA-03: platform verification review SLA and checklist. */
export const VERIFICATION_REVIEW_SLA_HOURS = 48;

export const VERIFICATION_REVIEW_CHECKLIST_KEYS = [
  "syndicate_card",
  "specialty_match",
  "national_id_present",
  "documents_readable",
] as const;

export type VerificationReviewChecklistKey = (typeof VERIFICATION_REVIEW_CHECKLIST_KEYS)[number];

/** PRVER02 — every key any profession's checklist can contain (the ops queue shows the profession's subset). */
export const ALL_REVIEW_CHECKLIST_KEYS = [
  ...VERIFICATION_REVIEW_CHECKLIST_KEYS,
  "moh_licence",
  "id_selfie_match",
  "criminal_record_certificate",
] as const;

export const REVIEW_CHECKLIST_LABELS: Record<string, { en: string; ar: string }> = {
  syndicate_card: { en: "Syndicate card matches the number and the profession's register", ar: "بطاقة النقابة تطابق الرقم وسجل المهنة" },
  specialty_match: { en: "Specialty certificate matches the declared specialty", ar: "شهادة التخصص تطابق التخصص المعلن" },
  national_id_present: { en: "National ID provided", ar: "تم تقديم الرقم القومي" },
  documents_readable: { en: "Documents are readable and unexpired", ar: "المستندات واضحة وغير منتهية" },
  moh_licence: { en: "Ministry of Health licence valid for the profession", ar: "ترخيص وزارة الصحة ساري للمهنة" },
  id_selfie_match: { en: "ID selfie matches the national ID photo (solo practitioner)", ar: "صورة السيلفي تطابق صورة الهوية (ممارس منفرد)" },
  criminal_record_certificate: { en: "Criminal-record certificate provided (solo practitioner)", ar: "تم تقديم صحيفة الحالة الجنائية (ممارس منفرد)" },
};

export const VERIFICATION_REJECT_REASON_CODES = [
  "ILLEGIBLE_DOCUMENTS",
  "SYNDICATE_MISMATCH",
  "SPECIALTY_MISMATCH",
  "INCOMPLETE_SUBMISSION",
  "PROFESSION_MISMATCH",
  "LICENCE_EXPIRED",
  "IDENTITY_MISMATCH",
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
  PROFESSION_MISMATCH: {
    en: "Documents do not match the declared profession.",
    ar: "المستندات لا تطابق المهنة المعلنة.",
  },
  LICENCE_EXPIRED: {
    en: "The licence is expired or expires too soon.",
    ar: "الترخيص منتهي أو على وشك الانتهاء.",
  },
  IDENTITY_MISMATCH: {
    en: "Identity evidence (national ID / selfie) does not match.",
    ar: "أدلة الهوية (الرقم القومي / السيلفي) غير مطابقة.",
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

export function missingReviewChecklistKeys(
  checklist: string[] | undefined,
  required: readonly string[] = VERIFICATION_REVIEW_CHECKLIST_KEYS,
): string[] {
  const set = new Set(checklist ?? []);
  return required.filter((k) => !set.has(k));
}