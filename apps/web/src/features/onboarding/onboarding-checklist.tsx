import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock, PartyPopper, Rocket, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dismissOnboarding,
  skipOnboardingStep,
  type OnboardingEntityDto,
  type OnboardingProgressDto,
  type OnboardingStepDto,
  type OnboardingStepKey,
} from "@/lib/onboarding-api";
import { useAuthStore } from "@/stores/auth-store";
import { SetupCheck } from "./setup-check";
import { SetupWizardDialog } from "./setup-wizard-dialog";
import {
  clearSkippedForNow,
  getSkippedForNow,
  takeJustDone,
  useOnboardingAutoRefresh,
  useOnboardingQuery,
} from "./setup-session";
import "./setup.css";

type Props = { variant?: "card" | "page"; onDismiss?: () => void };

export const SETUP_RETURN_KEY = "kx.setup.returnTo";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function unitKey(step: OnboardingStepDto, e?: OnboardingEntityDto) {
  return e ? `${step.key}@${e.id}` : step.key;
}

/** Quick setup checklist: every step deep-links into the action, completion is detected on the server and the list animates when a step flips. */
export function OnboardingChecklist({ variant = "card", onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const loc = useLocation();
  const user = useAuthStore((s) => s.user);
  const q = useOnboardingQuery(true);
  useOnboardingAutoRefresh(true);
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState<OnboardingStepKey | null>(null);
  const prev = useRef<Map<string, string> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [skippedNow, setSkippedNow] = useState<OnboardingStepKey | null>(() => getSkippedForNow());

  const openWizard = (key?: OnboardingStepKey) => {
    setWizardKey(key ?? null);
    setWizardOpen(true);
  };

  const data = q.data;

  // Detect pending -> done flips between two server answers (and the step the user just finished before being sent back here).
  useEffect(() => {
    if (!data) return;
    const now = new Map<string, string>();
    const flipped = new Set<string>();
    for (const s of data.steps) {
      if (s.entities) for (const e of s.entities) now.set(unitKey(s, e), e.status);
      now.set(unitKey(s), s.status);
    }
    if (prev.current) {
      for (const [k, v] of now) if (v === "done" && prev.current.get(k) === "pending") flipped.add(k);
    } else {
      const jd = takeJustDone();
      if (jd) {
        flipped.add(jd.key);
        if (jd.entity) flipped.add(`${jd.key}@${jd.entity}`);
      }
    }
    prev.current = now;
    if (flipped.size === 0) return;
    // intentional state update in response to a server answer
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJustDone(flipped);
    clearSkippedForNow();
    setSkippedNow(null);
    const timer = window.setTimeout(() => {
      setJustDone(new Set());
      const cta = rootRef.current?.querySelector<HTMLElement>('[data-next="true"] .kx-setup-cta');
      const row = rootRef.current?.querySelector<HTMLElement>('[data-next="true"]');
      row?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      cta?.focus({ preventScroll: true });
    }, reducedMotion() ? 50 : 1300);
    return () => window.clearTimeout(timer);
  }, [data]);

  const skip = useMutation({
    mutationFn: ({ key, entityId }: { key: OnboardingStepKey; entityId?: string }) => skipOnboardingStep(key, entityId),
    onSuccess: (d) => qc.setQueryData(["onboarding"], d),
  });
  const dismiss = useMutation({
    mutationFn: dismissOnboarding,
    onSuccess: (d) => {
      qc.setQueryData(["onboarding"], d);
      onDismiss?.();
    },
  });

  const nextKey = useMemo(() => pickNext(data, skippedNow), [data, skippedNow]);

  if (q.isLoading) {
    return (
      <Card data-testid="setup-checklist-loading" aria-busy="true">
        <CardContent className="min-h-48 space-y-3 pt-(--kx-card-pad)" role="status">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
        </CardContent>
      </Card>
    );
  }
  if (q.isError || !data) return null;
  if (variant === "card" && data.dismissedAt && data.allDone) return null;
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  const name = (e: { nameEn: string; nameAr: string }) => (lang === "ar" ? e.nameAr || e.nameEn : e.nameEn);
  const visible = data.steps;
  const total = data.steps.filter((s) => s.available).length;
  const remember = () => {
    try { sessionStorage.setItem(SETUP_RETURN_KEY, loc.pathname); } catch { /* ignore */ }
  };

  return (
    <Card ref={rootRef as never} data-testid="setup-checklist" data-all-done={String(data.allDone)} data-progress={data.progressPercent} data-variant={variant}>
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{t("onboarding.title")}</CardTitle>
            <CardDescription>{data.allDone ? t("onboarding.subtitleDone") : t("onboarding.subtitle")}</CardDescription>
          </div>
          {variant === "card" && !data.allDone ? (
            <Button type="button" variant="ghost" size="sm" aria-expanded={!collapsed} aria-controls="setup-steps" onClick={() => setCollapsed((c) => !c)} data-testid="setup-collapse">
              <ChevronDown className={`size-4 transition-transform ${collapsed ? "-rotate-90 rtl:rotate-90" : ""}`} aria-hidden />
              {collapsed ? t("onboarding.expand") : t("onboarding.collapse")}
            </Button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={data.overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("onboarding.progress")}
            data-testid="setup-progressbar"
          >
            <div className="kx-setup-fill h-full rounded-full bg-primary" style={{ width: `${data.overallPercent}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground" data-testid="setup-progress-label">
            {t("onboarding.progressCount", { done: data.doneUnits, total: data.totalUnits, percent: data.overallPercent })}
          </span>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{t("onboarding.progressLabel", { percent: data.progressPercent })}</p>
      </CardHeader>

      {data.allDone ? (
        <CardContent>
          <div className="kx-setup-celebrate flex flex-col items-center gap-3 rounded-xl border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.07)] px-4 py-8 text-center" data-testid="setup-complete">
            <span className="flex size-14 items-center justify-center rounded-full bg-[hsl(var(--success))] text-white" data-complete-badge>
              <SetupCheck className="size-8" animate />
            </span>
            <div>
              <p className="flex items-center justify-center gap-2 text-lg font-semibold"><PartyPopper className="size-5 text-primary" aria-hidden />{t("onboarding.completeTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.completeBody")}</p>
            </div>
            {variant === "card" ? (
              <Button type="button" onClick={() => dismiss.mutate()} disabled={dismiss.isPending} data-testid="setup-dismiss">{t("onboarding.dismiss")}</Button>
            ) : (
              <Button asChild><Link to="/">{t("onboarding.goToDashboard")}</Link></Button>
            )}
          </div>
        </CardContent>
      ) : (
        <CardContent id="setup-steps" hidden={collapsed} className="space-y-1.5">
          <ol className="space-y-1.5" data-testid="setup-steps">
            {visible.map((step, idx) => {
              const isNext = step.key === nextKey;
              const multi = (step.entities?.length ?? 0) > 1;
              // Expandable branch lists stay collapsed by default (open only when the user expands).
              const expanded = multi && Boolean(open[step.key]);
              const label = t(`onboarding.checklist.${step.key}`);
              const jd = justDone.has(step.key);
              return (
                <li
                  key={step.key}
                  className="kx-setup-row rounded-xl border border-transparent px-2 py-2"
                  data-testid="setup-step"
                  data-step={step.key}
                  data-status={step.status}
                  data-next={String(isNext)}
                  data-just-done={String(jd)}
                  data-available={String(step.available)}
                  data-can-perform={String(step.canPerform)}
                  data-scope={step.scope}
                >
                  <div className="flex items-start gap-3">
                    <StatusBadge status={step.status} index={idx + 1} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <button
                          type="button"
                          className={`text-start text-sm ${step.status === "pending" ? "font-semibold" : "text-muted-foreground"} hover:underline`}
                          id={`setup-step-${step.key}`}
                          onClick={() => openWizard(step.key)}
                          data-testid="setup-step-open"
                        >
                          {label}
                        </button>
                        {!step.required ? <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">{t("onboarding.optional")}</span> : null}
                        {!step.available ? <span className="rounded-full border border-primary/40 bg-card px-2 py-0.5 text-[11px] font-medium text-primary" data-testid="setup-upgrade">{t("onboarding.upgrade")}</span> : null}
                        {step.scope === "clinic" && (step.entities?.length ?? 0) > 1 ? (
                          <span className="text-xs tabular-nums text-muted-foreground" data-testid="setup-aggregate">{t("onboarding.aggregate", { done: step.doneCount, total: step.totalCount })}</span>
                        ) : null}
                      </div>
                      <div className="kx-setup-collapse"><div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t(`onboarding.why.${step.key}`)}</p>
                        {!step.canPerform && step.available ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid="setup-ask-owner">
                            <Lock className="size-3" aria-hidden />
                            {t("onboarding.askOwner")} {t("onboarding.whoCan", { roles: step.whoCan.map((r) => t(`onboarding.roles.${r}`, r)).join(", ") })}
                          </p>
                        ) : null}
                      </div></div>
                    </div>
                    {step.status === "pending" && step.available ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {!step.required && step.canPerform && !multi ? (
                          <Button type="button" variant="ghost" size="sm" disabled={skip.isPending} onClick={() => skip.mutate({ key: step.key, entityId: step.entities?.[0]?.id })} data-testid="setup-skip" aria-label={`${t("onboarding.skip")}: ${label}`}>{t("onboarding.skip")}</Button>
                        ) : null}
                        {multi ? (
                          <Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={`setup-ent-${step.key}`} onClick={() => setOpen((o) => ({ ...o, [step.key]: !expanded }))} data-testid="setup-toggle">
                            <ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
                            {expanded ? t("onboarding.hideClinics") : t("onboarding.showClinics", { count: step.totalCount })}
                          </Button>
                        ) : null}
                        {step.canPerform ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={isNext ? "default" : "outline"}
                            className="kx-setup-cta"
                            aria-describedby={`setup-step-${step.key}`}
                            data-testid="setup-cta"
                            onClick={() => openWizard(step.key)}
                          >
                            {isNext ? t("onboarding.start") : t("onboarding.open")}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled aria-describedby={`setup-step-${step.key}`} data-testid="setup-cta-disabled">{t("onboarding.open")}</Button>
                        )}
                      </div>
                    ) : null}
                    {step.status !== "pending" && step.available ? (
                      <span className="shrink-0 pt-1 text-xs font-medium text-[hsl(var(--success))]" data-testid="setup-state-label">{step.status === "skipped" ? t("onboarding.skipped") : t("onboarding.done")}</span>
                    ) : null}
                  </div>
                  {multi ? (
                    <div id={`setup-ent-${step.key}`} hidden={!expanded} className="mt-2 ms-9">
                      <ul className="space-y-1" data-testid="setup-entities">
                        {step.entities!.map((e) => {
                          const ejd = justDone.has(`${step.key}@${e.id}`);
                          return (
                            <li key={e.id} className="kx-setup-row flex items-center gap-2 rounded-lg px-2 py-1.5" data-testid="setup-entity" data-entity={e.id} data-status={e.status} data-just-done={String(ejd)}>
                              <StatusBadge status={e.status} small />
                              <span className={`min-w-0 flex-1 truncate text-sm ${e.status === "pending" ? "font-medium" : "text-muted-foreground"}`}>{name(e)}</span>
                              {e.status === "pending" ? (
                                <>
                                  {!step.required && step.canPerform ? (
                                    <Button type="button" variant="ghost" size="sm" disabled={skip.isPending} onClick={() => skip.mutate({ key: step.key, entityId: e.id })} aria-label={`${t("onboarding.skip")}: ${label} - ${name(e)}`}>{t("onboarding.skip")}</Button>
                                  ) : null}
                                  {step.canPerform && step.available ? (
                                    <Button asChild size="sm" variant="outline"><Link to={e.href} onClick={remember} aria-label={`${t("onboarding.open")}: ${label} - ${name(e)}`} data-testid="setup-entity-cta">{t("onboarding.open")}</Link></Button>
                                  ) : (
                                    <Button type="button" size="sm" variant="outline" disabled>{t("onboarding.open")}</Button>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs font-medium text-[hsl(var(--success))]">{e.status === "skipped" ? t("onboarding.skipped") : t("onboarding.done")}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground"><Sparkles className="size-3.5" aria-hidden />{t("onboarding.autoDetect", { count: total })}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" onClick={() => openWizard()} data-testid="setup-continue-wizard">
              <Rocket className="size-4" aria-hidden />
              {t("onboarding.wizard.continue", "Continue setup")}
            </Button>
            {variant === "card" ? (
              <Button asChild variant="ghost" size="sm"><Link to="/onboarding">{t("onboarding.viewAll")}</Link></Button>
            ) : (
              <Button asChild variant="outline" size="sm"><Link to="/">{t("onboarding.goToDashboard")}</Link></Button>
            )}
          </div>
        </CardContent>
      )}
      {user?.isTenantOwner && !user.mfaEnabled && variant === "page" ? (
        <CardContent>
          <div className="kx-callout flex-col gap-1 text-sm" data-tone="warn" data-testid="onboarding-mfa-setup">
            <p className="font-medium">{t("onboarding.mfaSetupTitle")}</p>
            <p className="mt-1">{t("onboarding.mfaSetupHint")}</p>
            <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/profile">{t("onboarding.mfaSetupCta")}</Link></Button>
          </div>
        </CardContent>
      ) : null}
      <SetupWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        data={data}
        initialKey={wizardKey}
      />
    </Card>
  );
}

function pickNext(data: OnboardingProgressDto | undefined, skipped: OnboardingStepKey | null): OnboardingStepKey | null {
  if (!data) return null;
  const pending = data.steps.filter((s) => s.available && s.status === "pending");
  const doable = pending.filter((s) => s.canPerform);
  const pool = doable.length ? doable : pending;
  const first = pool.find((s) => s.key !== skipped) ?? pool[0];
  return first?.key ?? null;
}

function StatusBadge({ status, index, small }: { status: "pending" | "done" | "skipped"; index?: number; small?: boolean }) {
  const size = small ? "size-5" : "size-7";
  if (status === "done") {
    return (
      <span className={`kx-setup-badge flex ${size} shrink-0 items-center justify-center rounded-full bg-[hsl(var(--success))] text-white`} data-testid="setup-badge-done">
        <SetupCheck className={small ? "size-3" : "size-4"} />
      </span>
    );
  }
  if (status === "skipped") {
    return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground`} aria-hidden>-</span>;
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold tabular-nums text-muted-foreground`} aria-hidden>{index ?? ""}</span>
  );
}
