import { ApiError } from "@/lib/http";

export type PatientPhoneConflictPatient = {
  id: string;
  mrn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
};

export type PatientPhoneConflictResponse = {
  conflict: boolean;
  patient?: PatientPhoneConflictPatient;
};

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const MIN_PHONE_DIGITS = 5;

export function patientPhoneConflictName(
  patient: PatientPhoneConflictPatient,
  language: string,
): string {
  if (language === "ar" && patient.firstNameAr) {
    return `${patient.firstNameAr} ${patient.lastNameAr ?? ""}`.trim();
  }
  return `${patient.firstNameEn} ${patient.lastNameEn}`.trim();
}

export function parsePhoneConflictFromError(e: unknown): PatientPhoneConflictPatient | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  if (!e.body || typeof e.body !== "object") return null;
  const body = e.body as { code?: string; existingPatient?: PatientPhoneConflictPatient };
  if (body.code === "PHONE_IN_USE" && body.existingPatient?.id) {
    return body.existingPatient;
  }
  return null;
}

export function phoneConflictMessage(
  patient: PatientPhoneConflictPatient,
  t: (key: string, fallback: string, opts?: Record<string, unknown>) => string,
  language: string,
): string {
  const name = patientPhoneConflictName(patient, language);
  return t(
    "patients.errorPhoneInUse",
    "Another patient already uses this phone number: {{name}} ({{mrn}}).",
    { name, mrn: patient.mrn },
  );
}
