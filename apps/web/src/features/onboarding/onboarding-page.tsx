import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";

export function OnboardingPage() {
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <OnboardingChecklist variant="page" />
      </div>
    </div>
  );
}