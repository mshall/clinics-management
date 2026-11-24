import { apiGet, apiPatch, apiPost } from "@/lib/http";

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
  | "kiorex_profile"
  | "doctor_verification"
  | "connect_kiorex"
  | "growth_links"
  | "nurse_verification"
  | "nurse_zones"
  | "nurse_services"
  | "nurse_prices"
  | "nurse_availability"
  | "nurse_safety_contact";

export type OnboardingStatus = "pending" | "done" | "skipped";

export type OnboardingEntityDto = { id: string; nameEn: string; nameAr: string; status: OnboardingStatus; href: string };

export type OnboardingStepDto = {
  key: OnboardingStepKey;
  order: number;
  required: boolean;
  /** Always false: completion is computed on the server from real data. */
  manual: boolean;
  scope: "org" | "clinic";
  status: OnboardingStatus;
  completedAt: string | null;
  href: string;
  whoCan: string[];
  canPerform: boolean;
  /** false = not included in the current plan (shown as an upgrade, excluded from progress). */
  available: boolean;
  entities: OnboardingEntityDto[] | null;
  doneCount: number;
  totalCount: number;
};

export type OnboardingProgressDto = {
  steps: OnboardingStepDto[];
  completedAt: string | null;
  activatedAt: string | null;
  activationJustAchieved: boolean;
  celebrateActivation: boolean;
  primaryClinicId: string | null;
  edition: "CLINIC" | "NURSE";
  progressPercent: number;
  overallPercent: number;
  doneUnits: number;
  totalUnits: number;
  allDone: boolean;
  nextKey: OnboardingStepKey | null;
  nextHref: string | null;
  dismissedAt: string | null;
  entityCount: number;
};

export function fetchOnboardingProgress() {
  return apiGet<OnboardingProgressDto>("/api/v1/onboarding");
}

/** Only optional steps can be skipped; completion is never ticked by hand. */
export function skipOnboardingStep(key: OnboardingStepKey, entityId?: string) {
  return apiPatch<OnboardingProgressDto>(`/api/v1/onboarding/steps/${key}`, { action: "skip", entityId });
}

export function dismissOnboarding() {
  return apiPost<OnboardingProgressDto>("/api/v1/onboarding/dismiss", {});
}
