import { ListChecks } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOnboardingAutoRefresh, useOnboardingQuery } from "@/features/onboarding/setup-session";
import "@/features/onboarding/setup.css";
import i18n from "@/lib/i18n";

/** Strings live beside the card (merged at import) so the shared locale files stay untouched. Arabic is in `_docs/test-flow/quick-setup-arabic-review.md`. */
i18n.addResourceBundle(
  "en",
  "translation",
  { nurseSetupCard: { title: "Finish setting up your practice", next: "Next: {{step}}", count: "{{done}} of {{total}} steps done", cta: "Continue setup", open: "Open setup checklist" } },
  true,
  false,
);
i18n.addResourceBundle(
  "ar",
  "translation",
  { nurseSetupCard: { title: "أكمل إعداد ممارستك", next: "الخطوة التالية: {{step}}", count: "تم إنجاز {{done}} من {{total}}", cta: "متابعة الإعداد", open: "فتح قائمة الإعداد" } },
  true,
  false,
);

/**
 * Nurse home card for the quick-setup checklist. It reads the same server progress as the full list at /nurse/onboarding, shows the next step,
 * eases the progress bar when a step completes and pulses once when the count goes up. Hidden once every step is done or skipped.
 */
export function NurseSetupCard() {
  const { t } = useTranslation();
  const q = useOnboardingQuery(true);
  useOnboardingAutoRefresh(true);
  const data = q.data;
  const prevDone = useRef<number | null>(null);
  const [bumped, setBumped] = useState(false);

  useEffect(() => {
    if (!data) return;
    const was = prevDone.current;
    prevDone.current = data.doneUnits;
    if (was === null || data.doneUnits <= was) return;
    // intentional: a short celebratory state in response to a server answer
    setBumped(true);
    const timer = window.setTimeout(() => setBumped(false), 1400);
    return () => window.clearTimeout(timer);
  }, [data]);

  if (q.isError || !data || data.allDone) return null;
  const pending = data.steps.filter((s) => s.available && s.status === "pending");
  const next = (pending.find((s) => s.canPerform) ?? pending[0]) ?? null;
  if (!next) return null;
  const nextLabel = t(`onboarding.checklist.${next.key}`);

  return (
    <section
      className="kx-setup-row rounded-2xl border bg-card p-4 sm:p-5"
      aria-labelledby="nurse-setup-h"
      data-testid="nurse-setup-card"
      data-next={next.key}
      data-progress={data.overallPercent}
      data-just-done={String(bumped)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true"><ListChecks className="size-5" /></span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="nurse-setup-h" className="text-base font-semibold">{t("nurseSetupCard.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="nurse-setup-next">{t("nurseSetupCard.next", { step: nextLabel })}</p>
          <div className="mt-2.5 flex items-center gap-3">
            <div
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={data.overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("onboarding.progress")}
              data-testid="nurse-setup-progress"
            >
              <div className="kx-setup-fill h-full rounded-full bg-primary" style={{ width: `${data.overallPercent}%` }} />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{t("nurseSetupCard.count", { done: data.doneUnits, total: data.totalUnits })}</span>
          </div>
        </div>
        <Button asChild className="min-h-11 w-full sm:w-auto">
          <Link to="/nurse/onboarding" data-testid="nurse-setup-open" className="kx-setup-cta">{t("nurseSetupCard.cta")}</Link>
        </Button>
      </div>
    </section>
  );
}
