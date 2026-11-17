import { apiGet, apiPatch } from "@/lib/http";

export type OnboardingStepKey =
  | "clinic_profile"
  | "clinic_logo"
  | "working_hours"
  | "appointment_types"
  | "doctor_availability"
  | "invite_receptionist"
  | "whatsapp_reminders"
  | "import_patients"
  | "first_appointment"
  | "first_check_in"
  | "eta_setup"
  | "kiorex_profile";

export type OnboardingStepDto = {
  key: OnboardingStepKey;
  required: boolean;
  status: "pending" | "done" | "skipped";
  completedAt: string | null;
  href: string;
};

export type OnboardingProgressDto = {
  steps: OnboardingStepDto[];
  completedAt: string | null;
  activatedAt: string | null;
  activationJustAchieved: boolean;
  celebrateActivation: boolean;
  primaryClinicId: string | null;
  progressPercent: number;
};

export function fetchOnboardingProgress() {
  return apiGet<OnboardingProgressDto>("/api/v1/onboarding");
}

export function patchOnboardingStep(key: OnboardingStepKey, action: "complete" | "skip") {
  return apiPatch<OnboardingProgressDto>(`/api/v1/onboarding/steps/${key}`, { action });
}