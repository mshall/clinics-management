import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, PartyPopper, SkipForward } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchOnboardingProgress,
  patchOnboardingStep,
  type OnboardingStepDto,
  type OnboardingStepKey,
} from "@/lib/onboarding-api";
import { useAuthStore } from "@/stores/auth-store";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type Props = {
  variant?: "card" | "page";
  onDismiss?: () => void;
};

export function OnboardingChecklist({ variant = "card", onDismiss }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const showMfaSetup = Boolean(authUser?.isTenantOwner && !authUser?.mfaEnabled);
  const q = useQuery({
    queryKey: ["onboarding"],
    queryFn: fetchOnboardingProgress,
    staleTime: 30_000,
  });
  const patch = useMutation({
    mutationFn: ({ key, action }: { key: OnboardingStepKey; action: "complete" | "skip" }) =>
      patchOnboardingStep(key, action),
    onSuccess: (data) => {
      qc.setQueryData(["onboarding"], data);
    },
  });

  const [showCelebrate, setShowCelebrate] = useState(false);
  useSyncOnChange([q.data?.activationJustAchieved], () => {
    if (q.data?.activationJustAchieved) setShowCelebrate(true);
  });

  if (q.isLoading && variant === "page") return <Card><CardContent className="space-y-3 pt-(--kx-card-pad)" role="status" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5" />)}</CardContent></Card>;
  if (q.isLoading || q.isError || !q.data) return null;
  if (q.data.completedAt && variant === "card") return null;

  const data = q.data;
  const pending = data.steps.filter((s) => s.status === "pending");
  // Dashboard card: only what is left to do (first 4); the full checklist lives on /onboarding.
  const visibleSteps = variant === "card" ? pending.slice(0, 4) : data.steps;

  return (
  <Card className={variant === "page" ? undefined : undefined}>
      {showCelebrate ? (
        <CardHeader className="border-b border-primary/20 bg-primary/5">
          <ActivationCelebrate
            title={t("onboarding.activationTitle")}
            body={t("onboarding.activationBody")}
            onClose={() => setShowCelebrate(false)}
            closeLabel={t("common.close")}
          />
        </CardHeader>
      ) : null}
      <CardHeader>
        <CardTitle className="text-base">{t("onboarding.title")}</CardTitle>
        <CardDescription>{t("onboarding.subtitle")}</CardDescription>
        {showMfaSetup ? (
          <div className="kx-callout mt-3 flex-col gap-1 text-sm" data-tone="warn" data-testid="onboarding-mfa-setup">
            <p className="font-medium">{t("onboarding.mfaSetupTitle", "Protect money with MFA")}</p>
            <p className="mt-1 text-muted-foreground">
              {t(
                "onboarding.mfaSetupHint",
                "Owners, admins and finance must enable authenticator MFA within 7 days. Billing locks after that until MFA is on.",
              )}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/profile">{t("onboarding.mfaSetupCta", "Set up MFA in Profile")}</Link>
            </Button>
          </div>
        ) : null}
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={data.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("onboarding.progress")}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${data.progressPercent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{t("onboarding.progressLabel", { percent: data.progressPercent })}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1">
          {visibleSteps.map((step) => (
            <StepRow
              key={step.key}
              step={step}
              label={t(`onboarding.checklist.${step.key}`)}
              optionalLabel={t("onboarding.optional")}
              skipLabel={t("onboarding.skip")}
              pending={patch.isPending}
              onSkip={(key) => patch.mutate({ key, action: "skip" })}
            />
          ))}
        </ul>
        {variant === "page" ? (
          <Button asChild className="w-full">
            <Link to="/">{t("onboarding.goToDashboard")}</Link>
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="default" size="sm">
              <Link to="/onboarding">{t("onboarding.viewAll")}{variant === "card" && pending.length > 4 ? ` (${pending.length})` : ""}</Link>
            </Button>
            {pending.length === 0 && onDismiss ? (
              <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
                {t("onboarding.dismiss")}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepRow({
  step,
  label,
  optionalLabel,
  skipLabel,
  pending,
  onSkip,
}: {
  step: OnboardingStepDto;
  label: string;
  optionalLabel: string;
  skipLabel: string;
  pending: boolean;
  onSkip: (key: OnboardingStepKey) => void;
}) {
  const icon =
    step.status === "done" ? (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--success))] text-white"><Check className="size-3.5" aria-hidden /></span>
    ) : step.status === "skipped" ? (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><SkipForward className="size-3.5" aria-hidden /></span>
    ) : (
      <Circle className="size-6 shrink-0 text-border" strokeWidth={1.75} aria-hidden />
    );

  return (
    <li className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60" data-status={step.status}>
      {icon}
      <Link to={step.href} className={`min-w-0 flex-1 py-1 text-start hover:underline ${step.status === "done" ? "text-muted-foreground" : "font-medium"}`}>
        {label}
        {!step.required ? <span className="ms-1 text-xs font-normal text-muted-foreground">({optionalLabel})</span> : null}
      </Link>
      {step.status === "pending" && !step.required ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 text-xs"
          disabled={pending}
          onClick={() => onSkip(step.key)}
        >
          {skipLabel}
        </Button>
      ) : null}
    </li>
  );
}

function ActivationCelebrate({
  title,
  body,
  onClose,
  closeLabel,
}: {
  title: string;
  body: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <PartyPopper className="size-8 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onClose}>
        {closeLabel}
      </Button>
    </div>
  );
}