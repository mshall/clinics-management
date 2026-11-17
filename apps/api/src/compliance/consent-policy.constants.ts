import { MessageChannel } from "@prisma/client";
import {
  MESSAGING_CONSENT_MARKETING,
  type MessagingConsentPurpose,
} from "../patients/messaging-consent.constants";

/** Purposes enforced by ConsentPolicy.require */
export const CONSENT_PURPOSE_AI = "AI_PROCESSING" as const;
export const CONSENT_PURPOSE_MARKETPLACE = "MARKETPLACE_SHARING" as const;
export const CONSENT_PURPOSE_DATA = "DATA_PROCESSING" as const;
export const CONSENT_PURPOSE_MESSAGING_MARKETING = "MESSAGING_MARKETING" as const;

export const CONSENT_PURPOSES = [
  CONSENT_PURPOSE_DATA,
  CONSENT_PURPOSE_AI,
  CONSENT_PURPOSE_MARKETPLACE,
  CONSENT_PURPOSE_MESSAGING_MARKETING,
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export type ConsentRequireContext = {
  channel?: MessageChannel;
};

export const CONSENT_ERROR_MESSAGES: Record<ConsentPurpose, { en: string; ar: string; code: string }> = {
  [CONSENT_PURPOSE_DATA]: {
    code: "PATIENT_CONSENT_DATA_REQUIRED",
    en: "Record data-processing consent for this patient before continuing.",
    ar: "سجّل موافقة معالجة البيانات لهذا المريض قبل المتابعة.",
  },
  [CONSENT_PURPOSE_AI]: {
    code: "PATIENT_CONSENT_AI_REQUIRED",
    en: "Patient has not consented to AI processing of their health data.",
    ar: "المريض لم يوافق على معالجة بياناته الصحية بالذكاء الاصطناعي.",
  },
  [CONSENT_PURPOSE_MARKETPLACE]: {
    code: "PATIENT_CONSENT_MARKETPLACE_REQUIRED",
    en: "Patient has not consented to marketplace / Kiorex profile sharing.",
    ar: "المريض لم يوافق على مشاركة ملفه عبر السوق / كيوركس.",
  },
  [CONSENT_PURPOSE_MESSAGING_MARKETING]: {
    code: "PATIENT_CONSENT_MARKETING_REQUIRED",
    en: "Patient has not consented to marketing messages on this channel.",
    ar: "المريض لم يوافق على الرسائل التسويقية على هذه القناة.",
  },
};

export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export { MESSAGING_CONSENT_MARKETING, type MessagingConsentPurpose };