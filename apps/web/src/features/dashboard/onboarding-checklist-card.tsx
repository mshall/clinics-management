import { useState } from "react";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { useAuthStore } from "@/stores/auth-store";

const DISMISS_KEY = "kiorly.onboarding.dismissed";

export function OnboardingChecklistCard() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  const owner = Boolean(user?.isTenantOwner) || user?.role === "group_admin";
  if (!owner || dismissed) return null;

  return (
    <OnboardingChecklist
      variant="card"
      onDismiss={() => {
        sessionStorage.setItem(DISMISS_KEY, "1");
        setDismissed(true);
      }}
    />
  );
}