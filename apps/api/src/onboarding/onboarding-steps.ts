/** ON-04 checklist keys — keep in sync with web `onboarding-steps.ts`. */
export const ONBOARDING_STEP_KEYS = [
  "clinic_profile",
  "clinic_logo",
  "working_hours",
  "appointment_types",
  "doctor_availability",
  "invite_receptionist",
  "whatsapp_reminders",
  "import_patients",
  "first_appointment",
  "first_check_in",
  "kiorex_profile",
  "doctor_verification",
  "connect_kiorex",
  "nurse_verification",
  "nurse_zones",
  "nurse_services",
  "nurse_prices",
  "nurse_availability",
  "nurse_safety_contact",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export const ONBOARDING_REQUIRED_STEPS: readonly OnboardingStepKey[] = [
  "clinic_profile",
  "working_hours",
  "appointment_types",
  "doctor_availability",
  "first_appointment",
  "first_check_in",
];

export const ONBOARDING_SKIPPABLE_STEPS: readonly OnboardingStepKey[] = ONBOARDING_STEP_KEYS.filter(
  (k) => !ONBOARDING_REQUIRED_STEPS.includes(k),
);

export const SKIPPED_STEP_VALUE = "skipped";

export type OnboardingStepsJson = Record<string, string>;

export function isStepDone(value: string | undefined): boolean {
  if (!value) return false;
  return value !== SKIPPED_STEP_VALUE;
}

export function isStepSatisfied(value: string | undefined): boolean {
  return Boolean(value);
}

/** CR-01: first real visit flow — booked appointment + front-desk check-in. */
export function isCr01ActivationMet(steps: OnboardingStepsJson): boolean {
  return isStepDone(steps.first_appointment) && isStepDone(steps.first_check_in);
}

export function allRequiredStepsSatisfied(steps: OnboardingStepsJson): boolean {
  return ONBOARDING_REQUIRED_STEPS.every((k) => isStepSatisfied(steps[k]));
}

/** Median minutes from tenant creation to each required step timestamp (pilot analytics). */
export function medianMinutesToRequiredSteps(
  tenantCreatedAt: Date,
  steps: OnboardingStepsJson,
): number | null {
  const deltas: number[] = [];
  for (const key of ONBOARDING_REQUIRED_STEPS) {
    const raw = steps[key];
    if (!raw || raw === SKIPPED_STEP_VALUE) continue;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) continue;
    deltas.push((at.getTime() - tenantCreatedAt.getTime()) / 60_000);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 1 ? deltas[mid]! : (deltas[mid - 1]! + deltas[mid]!) / 2;
}