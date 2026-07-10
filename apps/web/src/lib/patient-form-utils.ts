import {
  patientAcquisitionFormToBody,
  patientAcquisitionFormValuesFromPatient,
  validatePatientAcquisitionForm,
  type PatientAcquisitionFormValues,
} from "@/components/patient-acquisition-fields";
import type { PatientDto } from "@/lib/api-schema";

export type PatientDemographicsFormValues = {
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string;
  lastNameAr: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  nationalId: string;
  homeBranchId: string;
  acquisition: PatientAcquisitionFormValues;
};

function dobInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function patientToDemographicsForm(patient: PatientDto): PatientDemographicsFormValues {
  return {
    firstNameEn: patient.firstNameEn,
    lastNameEn: patient.lastNameEn,
    firstNameAr: patient.firstNameAr ?? "",
    lastNameAr: patient.lastNameAr ?? "",
    dob: dobInputValue(patient.dob),
    gender: patient.gender ?? "M",
    phone: patient.phone,
    email: patient.email ?? "",
    nationalId: patient.nationalId ?? "",
    homeBranchId: patient.homeBranchId ?? "",
    acquisition: patientAcquisitionFormValuesFromPatient(patient),
  };
}

export function validatePatientDemographicsForm(
  values: PatientDemographicsFormValues,
  t: (key: string, fallback: string) => string,
): string | null {
  const issues = collectPatientDemographicsValidationIssues(values, t);
  return issues[0] ?? null;
}

export function collectPatientDemographicsValidationIssues(
  values: PatientDemographicsFormValues,
  t: (key: string, fallback: string) => string,
): string[] {
  const issues: string[] = [];
  if (!values.firstNameEn.trim() || !values.lastNameEn.trim()) {
    issues.push(t("patients.errorNameRequired", "English first and last name are required."));
  }
  if (!values.firstNameAr.trim()) {
    issues.push(t("patients.errorFirstNameAr", "Arabic first name is required."));
  }
  if (!values.lastNameAr.trim()) {
    issues.push(t("patients.errorLastNameAr", "Arabic last name is required."));
  }
  if (!values.phone.trim()) {
    issues.push(t("patients.errorPhoneRequired", "Phone is required."));
  }
  const acquisitionError = validatePatientAcquisitionForm(values.acquisition, t);
  if (acquisitionError) issues.push(acquisitionError);
  return issues;
}

export function demographicsFormToPatchBody(
  values: PatientDemographicsFormValues,
): Record<string, string | undefined> {
  return {
    firstNameEn: values.firstNameEn.trim(),
    lastNameEn: values.lastNameEn.trim(),
    firstNameAr: values.firstNameAr.trim(),
    lastNameAr: values.lastNameAr.trim(),
    ...(values.dob.trim() ? { dob: values.dob.trim() } : { dob: undefined }),
    gender: values.gender,
    phone: values.phone.trim(),
    email: values.email.trim() || undefined,
    nationalId: values.nationalId.trim() || undefined,
    homeBranchId: values.homeBranchId || undefined,
    ...patientAcquisitionFormToBody(values.acquisition),
  };
}

export function canSavePatientDemographicsForm(values: PatientDemographicsFormValues): boolean {
  return Boolean(
    values.firstNameEn.trim() &&
      values.lastNameEn.trim() &&
      values.firstNameAr.trim() &&
      values.lastNameAr.trim() &&
      values.phone.trim(),
  );
}
