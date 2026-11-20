import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type OperationWizardStage = 1 | 2;

type OperationWizardStepsProps = {
  stage: OperationWizardStage;
  onStageChange?: (stage: OperationWizardStage) => void;
  /** When false, stage 1 cannot be selected (call center). */
  stage1Enabled?: boolean;
  onStage1Blocked?: () => void;
  className?: string;
};

export function OperationWizardSteps({
  stage,
  onStageChange,
  stage1Enabled = true,
  onStage1Blocked,
  className,
}: OperationWizardStepsProps) {
  const { t } = useTranslation();

  const steps: { stage: OperationWizardStage; title: string; hint: string }[] = [
    {
      stage: 1,
      title: t("operations.wizardStage1Title", "Booking details"),
      hint: t(
        "operations.wizardStage1Hint",
        "Patient, date & time, doctor, cost, and how they found us",
      ),
    },
    {
      stage: 2,
      title: t("operations.wizardStage2Title", "Clinical prep"),
      hint: t(
        "operations.wizardStage2Hint",
        "Lab tests, radiology, prescriptions, comments, and other documents",
      ),
    },
  ];

  return (
    <ol
      className={cn("grid gap-2 sm:grid-cols-2", className)}
      aria-label={t("operations.wizardAria", "Operation stages")}
    >
      {steps.map((s) => {
        const active = stage === s.stage;
        const locked = s.stage === 1 && !stage1Enabled;
        return (
          <li key={s.stage}>
            <button
              type="button"
              data-testid={`operation-wizard-stage-${s.stage}`}
              disabled={!onStageChange}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-start transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-muted/20 hover:bg-muted/40",
                locked && "opacity-70",
                !onStageChange && "cursor-default",
              )}
              onClick={() => {
                if (!onStageChange) return;
                if (s.stage === 1 && !stage1Enabled) {
                  onStage1Blocked?.();
                  return;
                }
                onStageChange(s.stage);
              }}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("operations.wizardStageLabel", "Stage {{n}}", { n: s.stage })}
              </span>
              <span className="text-sm font-semibold text-foreground">{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
