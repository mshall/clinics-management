import { PlanKey } from "@prisma/client";

/** Canonical legal document ids — must match GET /public/legal/:doc */
export const LEGAL_DOC_IDS = [
  "terms_of_service",
  "subscription_terms",
  "kiorex_marketplace_fees",
  "dpa",
  "patient_privacy_notice",
  "acceptable_use",
  "refund_policy",
] as const;

export type LegalDocumentId = (typeof LEGAL_DOC_IDS)[number];

export type LegalDocumentMeta = {
  id: LegalDocumentId;
  version: string;
  titleEn: string;
  titleAr: string;
};

/** GT-02 pack version bump when counsel updates text */
export const LEGAL_PACK_VERSION = "2026-11-18";

export const LEGAL_CATALOG: Record<LegalDocumentId, LegalDocumentMeta> = {
  terms_of_service: {
    id: "terms_of_service",
    version: LEGAL_PACK_VERSION,
    titleEn: "Terms of service",
    titleAr: "شروط الخدمة",
  },
  subscription_terms: {
    id: "subscription_terms",
    version: LEGAL_PACK_VERSION,
    titleEn: "Subscription terms",
    titleAr: "شروط الاشتراك",
  },
  kiorex_marketplace_fees: {
    id: "kiorex_marketplace_fees",
    version: LEGAL_PACK_VERSION,
    titleEn: "Kiorex marketplace fee terms",
    titleAr: "رسوم سوق كيوركس",
  },
  dpa: {
    id: "dpa",
    version: LEGAL_PACK_VERSION,
    titleEn: "Data processing agreement (clinic)",
    titleAr: "اتفاقية معالجة البيانات (العيادة)",
  },
  patient_privacy_notice: {
    id: "patient_privacy_notice",
    version: LEGAL_PACK_VERSION,
    titleEn: "Patient privacy notice",
    titleAr: "إشعار خصوصية المريض",
  },
  acceptable_use: {
    id: "acceptable_use",
    version: LEGAL_PACK_VERSION,
    titleEn: "Acceptable use policy",
    titleAr: "سياسة الاستخدام المقبول",
  },
  refund_policy: {
    id: "refund_policy",
    version: LEGAL_PACK_VERSION,
    titleEn: "Refund policy",
    titleAr: "سياسة الاسترداد",
  },
};

export const SIGNUP_BASE_LEGAL: LegalDocumentId[] = [
  "terms_of_service",
  "acceptable_use",
  "dpa",
  "patient_privacy_notice",
];

export const SIGNUP_PAID_LEGAL: LegalDocumentId[] = [
  ...SIGNUP_BASE_LEGAL,
  "subscription_terms",
  "refund_policy",
  "kiorex_marketplace_fees",
];

export function isPaidPlanKey(planKey: PlanKey | string): boolean {
  const k = String(planKey).toUpperCase();
  return k !== PlanKey.LITE && k !== PlanKey.NURSE_LITE;
}

export function requiredLegalForSignup(planKey: PlanKey | string): LegalDocumentId[] {
  return isPaidPlanKey(planKey) ? [...SIGNUP_PAID_LEGAL] : [...SIGNUP_BASE_LEGAL];
}

export function requiredLegalForPlanChange(planKey: PlanKey): LegalDocumentId[] {
  return isPaidPlanKey(planKey) ? [...SIGNUP_PAID_LEGAL] : [...SIGNUP_BASE_LEGAL];
}

export function isLegalDocumentId(doc: string): doc is LegalDocumentId {
  return (LEGAL_DOC_IDS as readonly string[]).includes(doc);
}

export function legalAcceptancesPayload(docs: LegalDocumentId[]): { document: string; version: string }[] {
  return docs.map((d) => ({ document: d, version: LEGAL_CATALOG[d].version }));
}