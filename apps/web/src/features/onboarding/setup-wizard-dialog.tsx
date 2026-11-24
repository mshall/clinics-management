import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Lock, Rocket, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreateWizardDialogContent } from "@/components/create-wizard-chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiPatch } from "@/lib/http";
import {
  skipOnboardingStep,
  type OnboardingEntityDto,
  type OnboardingProgressDto,
  type OnboardingStepDto,
  type OnboardingStepKey,
} from "@/lib/onboarding-api";
import { cn } from "@/lib/utils";
import { SETUP_RETURN_KEY } from "./onboarding-checklist";
import { SetupCheck } from "./setup-check";

const WIZARD_INDEX_KEY = "kx.setup.wizardIndex";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: OnboardingProgressDto;
  initialKey?: OnboardingStepKey | null;
};

function liveSteps(data: OnboardingProgressDto): OnboardingStepDto[] {
  return data.steps.filter((s) => s.available);
}

function rememberReturn(pathname: string) {
  try {
    sessionStorage.setItem(SETUP_RETURN_KEY, pathname);
  } catch {
    /* ignore */
  }
}

function persistIndex(i: number) {
  try {
    sessionStorage.setItem(WIZARD_INDEX_KEY, String(i));
  } catch {
    /* ignore */
  }
}

function readPersistedIndex(): number | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_INDEX_KEY);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Sequential quick-setup wizard: one step at a time; progress resumes from session + server state. */
export function SetupWizardDialog({ open, onOpenChange, data, initialKey }: Props) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const steps = useMemo(() => liveSteps(data), [data]);
  const [index, setIndex] = useState(0);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<OnboardingEntityDto | null>(null);

  useEffect(() => {
    if (!open || steps.length === 0) return;
    let next = 0;
    if (initialKey) {
      const i = steps.findIndex((s) => s.key === initialKey);
      if (i >= 0) next = i;
    } else {
      const pending = steps.findIndex((s) => s.status === "pending");
      const saved = readPersistedIndex();
      next = pending >= 0 ? pending : saved != null && saved < steps.length ? saved : 0;
    }
    setIndex(next);
    setBranchesOpen(false);
    persistIndex(next);
  }, [open, initialKey, steps]);

  const step = steps[index];
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  const name = (e: { nameEn: string; nameAr: string }) => (lang === "ar" ? e.nameAr || e.nameEn : e.nameEn);

  const skip = useMutation({
    mutationFn: ({ key, entityId }: { key: OnboardingStepKey; entityId?: string }) =>
      skipOnboardingStep(key, entityId),
    onSuccess: (d) => qc.setQueryData(["onboarding"], d),
  });

  const excludeMut = useMutation({
    mutationFn: (clinicId: string) =>
      apiPatch(`/api/v1/clinics/${clinicId}`, { kiorexExcludedFromMarketplace: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["onboarding"] });
      await qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(t("onboarding.wizard.excludeSaved", "This branch will not be listed on Kiorex."));
      setExcludeTarget(null);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        toast.error(String((e.body as { message?: unknown }).message));
      } else toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  if (!step) return null;

  const multi = (step.entities?.length ?? 0) > 1;
  const pct = Math.round(((index + (step.status === "pending" ? 0 : 1)) / Math.max(steps.length, 1)) * 100);

  const goDo = (href: string) => {
    rememberReturn(loc.pathname.startsWith("/onboarding") ? "/onboarding" : "/");
    persistIndex(index);
    onOpenChange(false);
    nav(href);
  };

  const goNext = () => {
    if (index >= steps.length - 1) {
      onOpenChange(false);
      return;
    }
    const n = index + 1;
    setIndex(n);
    setBranchesOpen(false);
    persistIndex(n);
  };

  const goBack = () => {
    if (index <= 0) return;
    const n = index - 1;
    setIndex(n);
    setBranchesOpen(false);
    persistIndex(n);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <CreateWizardDialogContent>
          <div className="shrink-0 space-y-3 border-b border-border bg-linear-to-br from-primary/10 via-background to-background px-4 py-4 pe-12 sm:px-6 sm:py-5" data-testid="setup-wizard">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-kx-1">
                <Rocket className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold">{t("onboarding.wizard.title", "Quick setup")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.wizard.subtitle", "Finish one step at a time. Progress is saved automatically.")}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("onboarding.bar.stepOf", { n: index + 1, total: steps.length })}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" data-testid="setup-wizard-body">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {!step.required ? (
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">{t("onboarding.optional")}</span>
              ) : null}
              {step.status === "done" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--success))]">
                  <SetupCheck className="size-3.5" />
                  {t("onboarding.done")}
                </span>
              ) : null}
              {step.status === "skipped" ? (
                <span className="text-xs font-medium text-muted-foreground">{t("onboarding.skipped")}</span>
              ) : null}
            </div>
            <h3 className="text-base font-semibold" id={`wiz-step-${step.key}`}>
              {t(`onboarding.checklist.${step.key}`)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t(`onboarding.why.${step.key}`)}</p>
            {!step.canPerform ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                {t("onboarding.askOwner")}
              </p>
            ) : null}

            {multi ? (
              <div className="mt-4 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={branchesOpen}
                  onClick={() => setBranchesOpen((v) => !v)}
                  data-testid="setup-wizard-branches-toggle"
                >
                  {branchesOpen
                    ? t("onboarding.hideClinics")
                    : t("onboarding.showClinics", { count: step.totalCount })}
                </Button>
                <div
                  className={cn("space-y-2 rounded-xl border bg-muted/20 p-2", !branchesOpen && "hidden")}
                  data-testid="setup-wizard-branches"
                  hidden={!branchesOpen}
                >
                  {step.entities!.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
                      data-testid="setup-wizard-entity"
                      data-entity={e.id}
                      data-status={e.status}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name(e)}</span>
                      {e.status === "pending" && step.canPerform ? (
                        <>
                          <Button type="button" size="sm" variant="default" onClick={() => goDo(e.href)}>
                            {t("onboarding.open")}
                          </Button>
                          {step.key === "kiorex_profile" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setExcludeTarget(e)}
                              data-testid="setup-wizard-exclude"
                            >
                              {t("onboarding.wizard.excludeKiorex", "Exclude from Kiorex")}
                            </Button>
                          ) : null}
                          {!step.required ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={skip.isPending}
                              onClick={() => skip.mutate({ key: step.key, entityId: e.id })}
                            >
                              {t("onboarding.skip")}
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-[hsl(var(--success))]">
                          {e.status === "skipped" ? t("onboarding.skipped") : t("onboarding.done")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("onboarding.aggregate", { done: step.doneCount, total: step.totalCount })}
                </p>
              </div>
            ) : step.canPerform && step.status === "pending" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => goDo(step.href)} data-testid="setup-wizard-cta">
                  {t("onboarding.wizard.doThis", "Do this step")}
                </Button>
                {!step.required ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={skip.isPending}
                    onClick={() => skip.mutate({ key: step.key, entityId: step.entities?.[0]?.id })}
                  >
                    {t("onboarding.skip")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="kx-dialog-footer-flush shrink-0 border-t border-border bg-card/95 p-4 backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:gap-3 sm:p-5">
            <Button type="button" variant="outline" className="mb-2 w-full sm:mb-0 sm:w-auto" onClick={() => onOpenChange(false)}>
              <X className="size-4" aria-hidden />
              {t("common.close", "Close")}
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={index === 0} onClick={goBack} data-testid="setup-wizard-back">
                <ChevronLeft className="size-4 rtl-flip" aria-hidden />
                {t("help.tour.back")}
              </Button>
              <Button type="button" className="w-full sm:w-auto" onClick={goNext} data-testid="setup-wizard-next">
                {index >= steps.length - 1 ? (
                  <>
                    <Check className="size-4" aria-hidden />
                    {t("onboarding.wizard.finish", "Finish")}
                  </>
                ) : (
                  <>
                    {t("onboarding.wizard.next", "Next step")}
                    <ChevronRight className="size-4 rtl-flip" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CreateWizardDialogContent>
      </Dialog>

      <Dialog open={Boolean(excludeTarget)} onOpenChange={(o) => !o && setExcludeTarget(null)}>
        <CreateWizardDialogContent className="max-w-md sm:max-w-md">
          <DialogHeader className="space-y-2 border-b px-4 py-4 sm:px-6">
            <DialogTitle>{t("onboarding.wizard.excludeTitle", "Exclude this branch from Kiorex?")}</DialogTitle>
            <DialogDescription>
              {t(
                "onboarding.wizard.excludeBody",
                "“{{name}}” will not be listed on Kiorex for online booking. You can turn marketplace listing back on later in clinic settings — the clinics directory will show a reminder until you do.",
                { name: excludeTarget ? name(excludeTarget) : "" },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-t px-4 py-3 sm:px-6" data-testid="setup-exclude-confirm">
            <Button type="button" variant="outline" onClick={() => setExcludeTarget(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={excludeMut.isPending || !excludeTarget}
              onClick={() => excludeTarget && excludeMut.mutate(excludeTarget.id)}
              data-testid="setup-exclude-confirm-btn"
            >
              {t("onboarding.wizard.excludeConfirm", "Exclude from Kiorex")}
            </Button>
          </DialogFooter>
        </CreateWizardDialogContent>
      </Dialog>
    </>
  );
}
