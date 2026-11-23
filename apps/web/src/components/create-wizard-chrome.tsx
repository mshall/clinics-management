import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CreateWizardStep = {
  n: number;
  title: string;
  hint: string;
};

type ShellProps = {
  children: ReactNode;
  className?: string;
};

/** Full-height flex dialog shell — kills default padding so footer never clips. */
export function CreateWizardDialogContent({ children, className }: ShellProps) {
  return (
    <DialogContent
      className={cn(
        // Flex column + overflow hidden: header/footer stay pinned; only the body scrolls.
        "flex max-h-[min(92dvh,46rem)] w-[min(100%,42rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0",
        // Kill default dialog padding on all breakpoints (base uses max-sm:p-5 which otherwise wins).
        "!p-0 max-sm:!p-0 max-sm:!pb-0",
        "sm:max-w-2xl",
        className,
      )}
      aria-describedby={undefined}
    >
      {children}
    </DialogContent>
  );
}

type HeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  steps: CreateWizardStep[];
  step: number;
  stepsAriaLabel: string;
  stepLabel: (n: number) => string;
  onStepSelect: (n: number) => void;
};

export function CreateWizardHeader({
  icon,
  title,
  subtitle,
  steps,
  step,
  stepsAriaLabel,
  stepLabel,
  onStepSelect,
}: HeaderProps) {
  return (
    <DialogHeader className="shrink-0 space-y-3 border-b border-border bg-linear-to-br from-primary/10 via-background to-background px-4 py-4 pe-14 sm:px-6 sm:py-5 sm:pe-16">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-kx-1">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </div>
      </div>
      {/* Phone: compact equal-width strip so the action footer always fits. sm+: equal-height cards. */}
      <ol
        className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:items-stretch"
        aria-label={stepsAriaLabel}
      >
        {steps.map((s) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <li key={s.n} className="min-w-0 sm:h-full">
              <button
                type="button"
                className={cn(
                  "flex h-full w-full flex-col items-stretch gap-0.5 rounded-xl border text-start transition-colors",
                  "min-h-14 px-2 py-2 sm:min-h-[5.5rem] sm:gap-1 sm:px-3 sm:py-2.5",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : done
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/20 hover:bg-muted/35",
                )}
                aria-current={active ? "step" : undefined}
                onClick={() => onStepSelect(s.n)}
              >
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:gap-1.5 sm:text-xs">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                      done || active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden /> : s.n}
                  </span>
                  <span className="hidden truncate sm:inline">{stepLabel(s.n)}</span>
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground sm:text-sm">
                  {s.title}
                </span>
                <span className="mt-auto line-clamp-2 hidden text-xs leading-snug text-muted-foreground sm:block">
                  {s.hint}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground sm:hidden" aria-live="polite">
        {steps.find((s) => s.n === step)?.hint}
      </p>
    </DialogHeader>
  );
}

type BodyProps = {
  children: ReactNode;
  className?: string;
};

export function CreateWizardBody({ children, className }: BodyProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

type FooterProps = {
  cancelLabel: string;
  backLabel: string;
  continueLabel: string;
  step: number;
  maxStep: number;
  pending?: boolean;
  onCancel: () => void;
  onBack: () => void;
  onContinue: () => void;
  submit: ReactNode;
};

/** Fixed (non-sticky) footer — always visible inside the flex dialog shell. */
export function CreateWizardFooter({
  cancelLabel,
  backLabel,
  continueLabel,
  step,
  maxStep,
  pending,
  onCancel,
  onBack,
  onContinue,
  submit,
}: FooterProps) {
  return (
    <div
      data-testid="create-wizard-footer"
      className={cn(
        "kx-dialog-footer-flush shrink-0 border-t border-border bg-card/95 backdrop-blur-sm",
        "flex w-full flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-5 sm:pb-5",
      )}
    >
      <Button
        type="button"
        variant="outline"
        className="order-3 min-h-11 w-full sm:order-1 sm:min-h-10 sm:w-auto"
        onClick={onCancel}
        disabled={pending}
      >
        {cancelLabel}
      </Button>
      <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:min-h-10 sm:w-auto"
            onClick={onBack}
            disabled={pending}
          >
            <ChevronLeft className="size-4 rtl-flip" aria-hidden />
            {backLabel}
          </Button>
        ) : null}
        {step < maxStep ? (
          <Button
            type="button"
            className="min-h-11 w-full sm:min-h-10 sm:w-auto"
            onClick={onContinue}
            disabled={pending}
            data-testid="create-wizard-continue"
          >
            {continueLabel}
            <ChevronRight className="size-4 rtl-flip" aria-hidden />
          </Button>
        ) : (
          <div className="w-full sm:w-auto [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:min-h-10 sm:[&>button]:w-auto">
            {submit}
          </div>
        )}
      </div>
    </div>
  );
}
