import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Lock,
  PartyPopper,
  Rocket,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { SetupCheck } from "./setup-check";
import { defaultGroupIndex, groupSetupSteps, orderedSetupSteps, type SetupGroupId } from "./setup-groups";
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
const GROUP_INDEX_KEY = "kx.setup.groupIndex";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const GROUP_ICON: Record<SetupGroupId, LucideIcon> = {
  clinic: Building2,
  team: Users,
  golive: CalendarCheck,
  nurse: HeartPulse,
  optional: Sparkles,
};

function readGroupIndex(): number | null {
  try {
    const raw = sessionStorage.getItem(GROUP_INDEX_KEY);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function persistGroupIndex(i: number) {
  try {
    sessionStorage.setItem(GROUP_INDEX_KEY, String(i));
  } catch {
    /* ignore */
  }
}

function unitKey(step: OnboardingStepDto, e?: OnboardingEntityDto) {
  return e ? `${step.key}@${e.id}` : step.key;
}

/** Quick setup checklist: phased groups, sequential wizard, server-detected completion. */
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
  /** Which phase is visible — one group at a time. */
  const [groupIndex, setGroupIndex] = useState(0);
  const groupSynced = useRef(false);
  const prev = useRef<Map<string, string> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [skippedNow, setSkippedNow] = useState<OnboardingStepKey | null>(() => getSkippedForNow());

  const openWizard = (key?: OnboardingStepKey) => {
    setWizardKey(key ?? null);
    setWizardOpen(true);
  };

  const data = q.data;

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
  const groups = useMemo(() => (data ? groupSetupSteps(data.steps, nextKey) : []), [data, nextKey]);

  // Keep the visible phase on the next action (or resume session), one group at a time.
  useEffect(() => {
    if (groups.length === 0) return;
    const preferred = defaultGroupIndex(groups);
    if (!groupSynced.current) {
      const saved = readGroupIndex();
      const start = saved != null && saved >= 0 && saved < groups.length ? saved : preferred;
      setGroupIndex(start);
      persistGroupIndex(start);
      groupSynced.current = true;
      return;
    }
    // When the next action moves to another phase, follow it.
    if (groups[groupIndex] && !groups[groupIndex]!.hasNext && preferred !== groupIndex && groups[preferred]?.hasNext) {
      setGroupIndex(preferred);
      persistGroupIndex(preferred);
    }
  }, [groups, groupIndex]);

  const goGroup = (i: number) => {
    const next = Math.max(0, Math.min(groups.length - 1, i));
    setGroupIndex(next);
    persistGroupIndex(next);
  };

  // Global step index for badges (1..n across phases).
  const stepIndex = useMemo(() => {
    const m = new Map<OnboardingStepKey, number>();
    let i = 0;
    for (const g of groups) for (const s of g.steps) m.set(s.key, ++i);
    return m;
  }, [groups]);

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
  const total = data.steps.filter((s) => s.available).length;
  const remember = () => {
    try { sessionStorage.setItem(SETUP_RETURN_KEY, loc.pathname); } catch { /* ignore */ }
  };

  const activeGroup = groups[Math.min(groupIndex, Math.max(0, groups.length - 1))];
  const Icon = activeGroup ? GROUP_ICON[activeGroup.id] : Building2;

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
        {!data.allDone && groups.length > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-2" data-testid="setup-phase-nav">
            <p className="text-xs font-medium tabular-nums text-muted-foreground">
              {t("onboarding.groups.phaseOf", {
                n: Math.min(groupIndex, groups.length - 1) + 1,
                total: groups.length,
              })}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={groupIndex <= 0}
                onClick={() => goGroup(groupIndex - 1)}
                data-testid="setup-phase-back"
              >
                <ChevronLeft className="size-4 rtl-flip" aria-hidden />
                {t("onboarding.groups.prev", "Previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={groupIndex >= groups.length - 1}
                onClick={() => goGroup(groupIndex + 1)}
                data-testid="setup-phase-next"
              >
                {t("onboarding.groups.next", "Next")}
                <ChevronRight className="size-4 rtl-flip" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
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
        <CardContent id="setup-steps" hidden={collapsed} className="space-y-3">
          {activeGroup ? (
            <section
              className={cn(
                "overflow-hidden rounded-xl border bg-card/40",
                activeGroup.hasNext && "border-primary/35 shadow-sm",
                activeGroup.complete && "border-[hsl(var(--success)/0.25)]",
                activeGroup.optional && "border-dashed",
              )}
              data-testid="setup-group"
              data-setup-group={activeGroup.id}
              data-complete={String(activeGroup.complete)}
              data-has-next={String(activeGroup.hasNext)}
              data-optional={String(activeGroup.optional)}
            >
              <div className="flex items-start gap-3 px-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    activeGroup.complete
                      ? "bg-[hsl(var(--success))] text-white"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {activeGroup.complete ? <SetupCheck className="size-4" /> : <Icon className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h3 className="text-sm font-semibold">{t(`onboarding.groups.${activeGroup.id}.title`)}</h3>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {t("onboarding.groups.progress", { done: activeGroup.done, total: activeGroup.total })}
                    </span>
                    {activeGroup.optional ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("onboarding.optional")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(`onboarding.groups.${activeGroup.id}.hint`)}</p>
                </div>
              </div>
              <ol className="space-y-1 border-t border-border/70 px-2 py-2" data-testid="setup-steps">
                {activeGroup.steps.map((step) => {
                  const isNext = step.key === nextKey;
                  const multi = (step.entities?.length ?? 0) > 1;
                  const expandedEnt = multi && Boolean(open[step.key]);
                  const label = t(`onboarding.checklist.${step.key}`);
                  const jd = justDone.has(step.key);
                  const idx = stepIndex.get(step.key) ?? 0;
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
                      data-group={activeGroup.id}
                    >
                      <div className="flex items-start gap-3">
                        <StatusBadge status={step.status} index={idx} />
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
                              <Button type="button" variant="outline" size="sm" aria-expanded={expandedEnt} aria-controls={`setup-ent-${step.key}`} onClick={() => setOpen((o) => ({ ...o, [step.key]: !expandedEnt }))} data-testid="setup-toggle">
                                <ChevronDown className={`size-4 transition-transform ${expandedEnt ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
                                {expandedEnt ? t("onboarding.hideClinics") : t("onboarding.showClinics", { count: step.totalCount })}
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
                        <div id={`setup-ent-${step.key}`} hidden={!expandedEnt} className="mt-2 ms-9">
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
            </section>
          ) : null}
          {activeGroup?.complete && groupIndex < groups.length - 1 ? (
            <Button type="button" className="w-full sm:w-auto" onClick={() => goGroup(groupIndex + 1)} data-testid="setup-phase-continue">
              {t("onboarding.groups.continuePhase", "Continue to next phase")}
              <ChevronRight className="size-4 rtl-flip" aria-hidden />
            </Button>
          ) : null}
          <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground"><Sparkles className="size-3.5" aria-hidden />{t("onboarding.autoDetect", { count: total })}</p>
          <div className="flex flex-wrap gap-2 pt-1">
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

/** Prefer required phases first (optional extras last), matching the one-phase-at-a-time UI. */
function pickNext(data: OnboardingProgressDto | undefined, skipped: OnboardingStepKey | null): OnboardingStepKey | null {
  if (!data) return null;
  const pending = orderedSetupSteps(data.steps).filter((s) => s.status === "pending");
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
