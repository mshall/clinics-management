import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";

export function OnboardingPage() {
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <OnboardingChecklist variant="page" />
      </div>
    </div>
  );
}