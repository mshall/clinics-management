import { CalendarClock, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localeForLanguage } from "@/lib/locale-display";

export type SetPlanConfirmValues = {
  planKey: string;
  interval: "MONTHLY" | "ANNUAL";
  seats: number;
  reason: string;
  tenantName: string;
};

function addBillingPeriodPreview(start: Date, interval: "MONTHLY" | "ANNUAL"): Date {
  const end = new Date(start);
  if (interval === "ANNUAL") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}

function formatStamp(d: Date, language: string): string {
  return d.toLocaleString(localeForLanguage(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SetPlanConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: SetPlanConfirmValues | null;
  pending?: boolean;
  onConfirm: () => void;
};

/**
 * Rich confirmation before ops assign an org plan — shows the billing window that will be set.
 */
export function SetPlanConfirmDialog({
  open,
  onOpenChange,
  values,
  pending,
  onConfirm,
}: SetPlanConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const periodEnd = values ? addBillingPeriodPreview(now, values.interval) : null;
  const intervalLabel =
    values?.interval === "ANNUAL"
      ? t("platform.billingAnnual", "Annual")
      : t("platform.billingMonthly", "Monthly");
  const windowHint =
    values?.interval === "ANNUAL"
      ? t("platform.setPlanConfirmAnnualWindow", "About one year from confirmation")
      : t("platform.setPlanConfirmMonthlyWindow", "About one month from confirmation");

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="set-plan-confirm-description"
      >
        <div className="border-b border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent px-6 py-5 dark:from-sky-500/15 dark:via-sky-900/10">
          <DialogHeader className="space-y-3 text-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/20 text-sky-800 ring-4 ring-sky-500/10 dark:text-sky-200">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">
              {t("platform.setPlanConfirmTitle", "Confirm plan assignment")}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p id="set-plan-confirm-description" className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "platform.setPlanConfirmBody",
              "This will activate the selected plan for {{name}} and reset the billing period from now.",
              { name: values?.tenantName ?? "—" },
            )}
          </p>

          <dl className="space-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("platform.setPlanKey", "Plan")}</dt>
              <dd className="font-semibold">{values?.planKey ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("platform.setPlanInterval", "Interval")}</dt>
              <dd className="font-semibold">{intervalLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("platform.setPlanSeats", "Seats")}</dt>
              <dd className="font-semibold ltr-nums tabular-nums">{values?.seats ?? "—"}</dd>
            </div>
            {values?.reason ? (
              <div className="border-t border-border/60 pt-2">
                <dt className="text-xs text-muted-foreground">{t("platform.setPlanReason", "Reason")}</dt>
                <dd className="mt-0.5 text-foreground">{values.reason}</dd>
              </div>
            ) : null}
          </dl>

          <div
            className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 px-4 py-3.5 text-emerald-900 dark:from-emerald-500/20 dark:to-emerald-900/10 dark:text-emerald-200"
            data-testid="set-plan-confirm-period"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
              {t("platform.setPlanConfirmPeriodLabel", "Billing period that will be set")}
            </p>
            <p className="mt-1.5 text-sm font-medium leading-snug ltr-nums tabular-nums">
              {formatStamp(now, i18n.language)}
              <span className="mx-1.5 text-emerald-700/60 dark:text-emerald-300/60">→</span>
              {periodEnd ? formatStamp(periodEnd, i18n.language) : "—"}
            </p>
            <p className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-300/70">{windowHint}</p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || !values}
              onClick={onConfirm}
              data-testid="platform-set-plan-confirm"
            >
              <Check className="me-1.5 size-4" aria-hidden />
              {pending
                ? t("common.saving", "Saving…")
                : t("platform.setPlanConfirmAction", "Confirm set plan")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
