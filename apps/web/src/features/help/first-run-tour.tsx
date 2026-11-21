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

/** Non-blocking 5-step first-run card (ON-08). Auto-opens once on the setup checklist; reopen from Help. */
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

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="first-run-tour-title"
      data-testid="first-run-tour"
      className="fixed bottom-4 inset-s-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("help.tour.progress", { current: index + 1, total: steps.length })}</p>
        <button type="button" onClick={close} className="rounded-sm opacity-70 hover:opacity-100" aria-label={t("help.tour.skip")}>
          <X className="size-4" />
        </button>
      </div>
      <h2 id="first-run-tour-title" className="text-base font-semibold">
        {t(`${base}.title`)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t(`${base}.body`)}</p>
      {create.error ? <p className="mt-2 text-sm text-destructive">{(create.error as Error).message}</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          {t("help.tour.back")}
        </Button>
        <div className="flex gap-2">
          {step.path ? (
            <Button variant="outline" size="sm" onClick={() => navigate(step.path!)}>
              {t("help.tour.show")}
            </Button>
          ) : null}
          {step.samplePatient ? (
            <Button
              size="sm"
              disabled={create.isPending}
              data-testid="tour-sample-patient"
              onClick={() => create.mutate(undefined, { onSuccess: close })}
            >
              {t("help.sample.try")}
            </Button>
          ) : null}
          <Button size="sm" variant={step.samplePatient ? "ghost" : "default"} onClick={last ? close : () => setIndex((i) => i + 1)} data-testid="tour-next">
            {last ? t("help.tour.done") : t("help.tour.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
