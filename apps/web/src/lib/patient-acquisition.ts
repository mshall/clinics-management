export const PATIENT_ACQUISITION_CHANNELS = [
  "SOCIAL_FACEBOOK",
  "SOCIAL_INSTAGRAM",
  "SOCIAL_TIKTOK",
  "WEBSITE_GOOGLE",
  "DOCTOR_REFERRAL",
  "ANOTHER_PATIENT",
  "KIOREX",
  "OTHER",
] as const;

/** `IMPORT` is set by spreadsheet imports only (ON-05) — not offered in pickers. */
export type PatientAcquisitionChannel = (typeof PATIENT_ACQUISITION_CHANNELS)[number] | "IMPORT";

export function patientAcquisitionLabel(channel: PatientAcquisitionChannel, t: (key: string, fallback: string) => string): string {
  const keys: Record<PatientAcquisitionChannel, string> = {
    SOCIAL_FACEBOOK: "patients.acquisitionSocialFacebook",
    SOCIAL_INSTAGRAM: "patients.acquisitionSocialInstagram",
    SOCIAL_TIKTOK: "patients.acquisitionSocialTiktok",
    WEBSITE_GOOGLE: "patients.acquisitionWebsiteGoogle",
    DOCTOR_REFERRAL: "patients.acquisitionDoctorReferral",
    ANOTHER_PATIENT: "patients.acquisitionAnotherPatient",
    KIOREX: "patients.acquisitionKiorex",
    OTHER: "patients.acquisitionOther",
    IMPORT: "patients.acquisitionImport",
  };
  const fallbacks: Record<PatientAcquisitionChannel, string> = {
    SOCIAL_FACEBOOK: "Social Media — Facebook",
    SOCIAL_INSTAGRAM: "Social Media — Instagram",
    SOCIAL_TIKTOK: "Social Media — TikTok",
    WEBSITE_GOOGLE: "Website — Google",
    DOCTOR_REFERRAL: "Doctor Referral",
    ANOTHER_PATIENT: "Another Patient",
    KIOREX: "Kiorex",
    OTHER: "Other",
    IMPORT: "Imported",
  };
  return t(keys[channel], fallbacks[channel]);
}

export function patientAcquisitionDisplay(
  channel: PatientAcquisitionChannel | null | undefined,
  referralName: string | null | undefined,
  otherDetail: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (!channel) return "—";
  const base = patientAcquisitionLabel(channel, t);
  if ((channel === "DOCTOR_REFERRAL" || channel === "ANOTHER_PATIENT") && referralName?.trim()) {
    return `${base}: ${referralName.trim()}`;
  }
  if (channel === "OTHER" && otherDetail?.trim()) {
    return `${base}: ${otherDetail.trim()}`;
  }
  return base;
}
