export const PATIENT_ACQUISITION_CHANNELS = [
  "SOCIAL_FACEBOOK",
  "SOCIAL_INSTAGRAM",
  "SOCIAL_TIKTOK",
  "WEBSITE_GOOGLE",
  "DOCTOR_REFERRAL",
  "OTHER",
] as const;

export type PatientAcquisitionChannel = (typeof PATIENT_ACQUISITION_CHANNELS)[number];

export function patientAcquisitionLabel(channel: PatientAcquisitionChannel, t: (key: string, fallback: string) => string): string {
  const keys: Record<PatientAcquisitionChannel, string> = {
    SOCIAL_FACEBOOK: "patients.acquisitionSocialFacebook",
    SOCIAL_INSTAGRAM: "patients.acquisitionSocialInstagram",
    SOCIAL_TIKTOK: "patients.acquisitionSocialTiktok",
    WEBSITE_GOOGLE: "patients.acquisitionWebsiteGoogle",
    DOCTOR_REFERRAL: "patients.acquisitionDoctorReferral",
    OTHER: "patients.acquisitionOther",
  };
  const fallbacks: Record<PatientAcquisitionChannel, string> = {
    SOCIAL_FACEBOOK: "Social Media — Facebook",
    SOCIAL_INSTAGRAM: "Social Media — Instagram",
    SOCIAL_TIKTOK: "Social Media — TikTok",
    WEBSITE_GOOGLE: "Website — Google",
    DOCTOR_REFERRAL: "Doctor Referral",
    OTHER: "Other",
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
  if (channel === "DOCTOR_REFERRAL" && referralName?.trim()) {
    return `${base}: ${referralName.trim()}`;
  }
  if (channel === "OTHER" && otherDetail?.trim()) {
    return `${base}: ${otherDetail.trim()}`;
  }
  return base;
}
