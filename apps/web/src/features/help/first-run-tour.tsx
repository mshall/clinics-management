import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useHelpStore } from "@/stores/help-store";
import { TOUR_STEPS, tourGroupForRole, tourStorageKey } from "./help-content";
import { useSamplePatient } from "./use-sample-patient";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

function tourDone(userId: string): boolean {
  try {
    return window.localStorage.getItem(tourStorageKey(userId)) === "done";
  } catch {
    return true;
  }
}

/** Role-based product tour (ON-08). Auto-opens once on the setup checklist; reopen from Help or side-nav Quick tour. */
export function FirstRunTour() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const open = useHelpStore((s) => s.tourOpen);
  const setOpen = useHelpStore((s) => s.setTourOpen);
  const [index, setIndex] = useState(0);
  const group = tourGroupForRole(user?.role);
  const { create } = useSamplePatient(false);

  useEffect(() => {
    if (user?.id && group && pathname === "/onboarding" && !tourDone(user.id)) setOpen(true);
  }, [user?.id, group, pathname, setOpen]);

  useSyncOnChange([open], () => {
    if (open) setIndex(0);
  });

  if (!open || !group || !user) return null;
  const steps = TOUR_STEPS[group];
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const close = () => {
    try {
      window.localStorage.setItem(tourStorageKey(user.id), "done");
    } catch {
      /* private mode */
    }
    setOpen(false);
  };
  const base = `help.tour.${group}.${step.id}`;
  const shotSrc = step.screenshot ?? `/tour/${group}-${step.id}.svg`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-tour-title"
      data-testid="first-run-tour"
      className="fixed bottom-4 inset-s-4 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
    >
      <div className="relative aspect-[16/10] w-full bg-muted">
        <img
          src={shotSrc}
          alt=""
          className="size-full object-cover object-top"
          data-testid="tour-screenshot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <button
          type="button"
          onClick={close}
          className="absolute end-2 top-2 rounded-md bg-background/90 p-1.5 text-foreground shadow-sm opacity-90 hover:opacity-100"
          aria-label={t("help.tour.close", "Close tour")}
          data-testid="tour-close"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">{t("help.tour.progress", { current: index + 1, total: steps.length })}</p>
        <h2 id="first-run-tour-title" className="text-base font-semibold">
          {t(`${base}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(`${base}.body`)}</p>
        {create.error ? <p className="text-sm text-destructive">{(create.error as Error).message}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} data-testid="tour-back">
            {t("help.tour.back")}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} data-testid="tour-close-footer">
              {t("help.tour.close", "Close")}
            </Button>
            {step.path ? (
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(step.path!)}>
                {t("help.tour.show")}
              </Button>
            ) : null}
            {step.samplePatient ? (
              <Button
                type="button"
                size="sm"
                disabled={create.isPending}
                data-testid="tour-sample-patient"
                onClick={() => create.mutate(undefined, { onSuccess: close })}
              >
                {t("help.sample.try")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={step.samplePatient ? "ghost" : "default"}
              onClick={last ? close : () => setIndex((i) => i + 1)}
              data-testid="tour-next"
            >
              {last ? t("help.tour.done") : t("help.tour.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
