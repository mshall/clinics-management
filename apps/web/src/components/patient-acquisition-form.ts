import { PATIENT_ACQUISITION_CHANNELS, type PatientAcquisitionChannel } from "@/lib/patient-acquisition";

export function emptyPatientAcquisitionFormValues(): PatientAcquisitionFormValues {
  return { channel: "", referralName: "", otherDetail: "" };
}

export function patientAcquisitionFormValuesFromPatient(patient: {
  acquisitionChannel?: string | null;
  acquisitionReferralName?: string | null;
  acquisitionOtherDetail?: string | null;
}): PatientAcquisitionFormValues {
  const channel = (patient.acquisitionChannel ?? "") as PatientAcquisitionChannel | "";
  const valid = (PATIENT_ACQUISITION_CHANNELS as readonly string[]).includes(channel);
  return {
    channel: valid ? (channel as PatientAcquisitionChannel) : "",
    referralName: patient.acquisitionReferralName ?? "",
    otherDetail: patient.acquisitionOtherDetail ?? "",
  };
}

export function validatePatientAcquisitionRequired(
  values: PatientAcquisitionFormValues,
  t: (key: string, fallback: string) => string,
): string | null {
  if (!values.channel) {
    return t("patients.errorAcquisitionRequired", "Select how the patient found the clinic.");
  }
  return validatePatientAcquisitionForm(values, t);
}

export function validatePatientAcquisitionForm(
  values: PatientAcquisitionFormValues,
  t: (key: string, fallback: string) => string,
): string | null {
  if (values.channel === "DOCTOR_REFERRAL" && !values.referralName.trim()) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  if (values.channel === "OTHER" && !values.otherDetail.trim()) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  return null;
}

export function patientAcquisitionFormToBody(values: PatientAcquisitionFormValues): Record<string, string> {
  if (!values.channel) return {};
  const body: Record<string, string> = { acquisitionChannel: values.channel };
  if (values.channel === "DOCTOR_REFERRAL") {
    body.acquisitionReferralName = values.referralName.trim();
  }
  if (values.channel === "OTHER") {
    body.acquisitionOtherDetail = values.otherDetail.trim();
  }
  return body;
}

export type PatientAcquisitionFormValues = {
  channel: PatientAcquisitionChannel | "";
  referralName: string;
  otherDetail: string;
};
