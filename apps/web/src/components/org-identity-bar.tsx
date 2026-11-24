import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  specialtyLabel?: string | null;
  planLabel?: string | null;
  className?: string;
};

/**
 * Organization identity for the app top bar: name + specialty + plan in one h-9 chip
 * (aligned with GlobalPatientSearch). Truncates gracefully phone → tablet → desktop.
 */
export function OrgIdentityBar({ name, specialtyLabel, planLabel, className }: Props) {
  const { t } = useTranslation();
  const title = [name, specialtyLabel, planLabel ? `${t("app.orgPlan", "Plan")}: ${planLabel}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        // Match GlobalPatientSearch trigger: h-9, rounded-lg, muted surface.
        "flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg border border-border/70",
        "bg-muted/40 px-2 shadow-sm sm:gap-2.5 sm:px-2.5",
        className,
      )}
      title={title}
      aria-label={title}
      data-testid="header-org-identity"
    >
      <span
        className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
        aria-hidden
      >
        <Building2 className="size-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 sm:gap-2">
        <span className="truncate text-xs font-semibold tracking-tight text-foreground sm:text-sm">
          {name}
        </span>
        {specialtyLabel ? (
          <>
            <span className="hidden shrink-0 text-border sm:inline" aria-hidden>
              ·
            </span>
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
              <span className="sr-only">{t("app.orgSpecialty", "Specialty")}: </span>
              {specialtyLabel}
            </span>
          </>
        ) : null}
      </div>

      {planLabel ? (
        <>
          <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden />
          <span
            className={cn(
              "inline-flex max-w-[4.75rem] shrink-0 items-center gap-1 rounded-md border border-sky-500/25",
              "bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sky-900",
              "dark:text-sky-200 sm:max-w-[7.5rem]",
            )}
            data-testid="header-org-plan"
            title={t("app.orgPlanHint", "Your organization's current Kiorly plan")}
          >
            <span className="hidden uppercase tracking-wide text-sky-800/70 dark:text-sky-300/70 sm:inline">
              {t("app.orgPlan", "Plan")}
            </span>
            <span className="truncate">{planLabel}</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
