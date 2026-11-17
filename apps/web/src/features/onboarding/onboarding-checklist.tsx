import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, PartyPopper, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchOnboardingProgress,
  patchOnboardingStep,
  type OnboardingStepDto,
  type OnboardingStepKey,
} from "@/lib/onboarding-api";

type Props = {
  variant?: "card" | "page";
  onDismiss?: () => void;
};

export function OnboardingChecklist({ variant = "card", onDismiss }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
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
  useEffect(() => {
    if (q.data?.activationJustAchieved) setShowCelebrate(true);
  }, [q.data?.activationJustAchieved]);

  if (q.isLoading || q.isError || !q.data) return null;
  if (q.data.completedAt && variant === "card") return null;

  const data = q.data;
  const pending = data.steps.filter((s) => s.status === "pending");

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
        <CardTitle className="text-lg">{t("onboarding.title")}</CardTitle>
        <CardDescription>{t("onboarding.subtitle")}</CardDescription>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={data.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("onboarding.progress")}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${data.progressPercent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{t("onboarding.progressLabel", { percent: data.progressPercent })}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1">
          {data.steps.map((step) => (
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
              <Link to="/onboarding">{t("onboarding.viewAll")}</Link>
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
      <Check className="size-4 shrink-0 text-primary" aria-hidden />
    ) : step.status === "skipped" ? (
      <SkipForward className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    ) : (
      <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    );

  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
      {icon}
      <Link to={step.href} className="min-w-0 flex-1 text-start hover:underline">
        {label}
        {!step.required ? <span className="ms-1 text-xs text-muted-foreground">({optionalLabel})</span> : null}
      </Link>
      {step.status === "pending" && !step.required ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
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