import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";

export function OnboardingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2" data-testid="onboarding-back">
            <Link to="/">
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
              {t("onboarding.backToDashboard", "Back to dashboard")}
            </Link>
          </Button>
        </div>
        <OnboardingChecklist variant="page" />
      </div>
    </div>
  );
}
