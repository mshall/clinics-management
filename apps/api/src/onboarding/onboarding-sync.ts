import { DEFAULT_CLINIC_CLOSING_TIME, DEFAULT_CLINIC_OPENING_TIME } from "../common/clinic-hours";
import type { OnboardingStepKey, OnboardingStepsJson } from "./onboarding-steps";

export type OnboardingSyncInput = {
  tenant: {
    whatsAppRemindersEnabled: boolean;
    createdAt: Date;
  };
  clinics: {
    id: string;
    logoUrl: string | null;
    licenseNumber: string;
    openingTime: string;
    closingTime: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  appointmentTypeCount: number;
  appointmentTypeCustomized: boolean;
  availabilityTemplateUpdated: boolean;
  staffBeyondOwner: boolean;
  patientCount: number;
  appointmentCount: number;
  checkedInAppointmentCount: number;
  fiscalDeviceReady: boolean;
  kiorexProfileReady: boolean;
  doctorVerificationReady: boolean;
};

function isoNow(): string {
  return new Date().toISOString();
}

export function detectAutoCompletedSteps(input: OnboardingSyncInput): Partial<Record<OnboardingStepKey, string>> {
  const out: Partial<Record<OnboardingStepKey, string>> = {};
  const primary = input.clinics[0];
  if (!primary) return out;

  const now = isoNow();

  if (primary.licenseNumber && primary.licenseNumber !== "SELF-SERVE-PENDING") {
    out.clinic_profile = now;
  }

  if (primary.logoUrl?.trim()) {
    out.clinic_logo = now;
  }

  const hoursCustomized =
    primary.openingTime !== DEFAULT_CLINIC_OPENING_TIME ||
    primary.closingTime !== DEFAULT_CLINIC_CLOSING_TIME ||
    primary.updatedAt.getTime() > primary.createdAt.getTime() + 2000;
  if (hoursCustomized) {
    out.working_hours = now;
  }

  if (input.appointmentTypeCount > 0 && input.appointmentTypeCustomized) {
    out.appointment_types = now;
  }

  if (input.availabilityTemplateUpdated) {
    out.doctor_availability = now;
  }

  if (input.staffBeyondOwner) {
    out.invite_receptionist = now;
  }

  if (input.tenant.whatsAppRemindersEnabled) {
    out.whatsapp_reminders = now;
  }

  if (input.patientCount > 0) {
    out.import_patients = now;
  }

  if (input.appointmentCount > 0) {
    out.first_appointment = now;
  }

  if (input.checkedInAppointmentCount > 0) {
    out.first_check_in = now;
  }

  if (input.fiscalDeviceReady) {
    out.eta_setup = now;
  }

  if (input.kiorexProfileReady) {
    out.kiorex_profile = now;
  }

  if (input.doctorVerificationReady) {
    out.doctor_verification = now;
  }

  return out;
}

export function mergeAutoSteps(
  existing: OnboardingStepsJson,
  detected: Partial<Record<OnboardingStepKey, string>>,
): OnboardingStepsJson {
  const next: OnboardingStepsJson = { ...existing };
  for (const [key, ts] of Object.entries(detected)) {
    if (!next[key]) next[key] = ts;
  }
  return next;
}