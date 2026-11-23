import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  specialtyLabel?: string | null;
  className?: string;
};

/**
 * Compact organization identity for the app top bar.
 * Truncates gracefully from phone → tablet → desktop.
 */
export function OrgIdentityBar({ name, specialtyLabel, className }: Props) {
  const { t } = useTranslation();
  const title = specialtyLabel ? `${name} · ${specialtyLabel}` : name;

  return (
    <div
      className={cn(
        "group flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/50 px-2.5 py-1.5 shadow-sm sm:gap-3 sm:px-3",
        className,
      )}
      title={title}
      data-testid="header-org-identity"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 sm:size-9"
        aria-hidden
      >
        <Building2 className="size-3.5 sm:size-4" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-semibold tracking-tight text-foreground sm:text-sm">
          {name}
        </span>
        {specialtyLabel ? (
          <span className="truncate text-[10px] text-muted-foreground sm:text-xs">
            <span className="sr-only">{t("app.orgSpecialty", "Specialty")}: </span>
            {specialtyLabel}
          </span>
        ) : (
          <span className="hidden truncate text-[10px] text-muted-foreground sm:inline sm:text-xs">
            {t("app.orgWorkspace", "Organization workspace")}
          </span>
        )}
      </span>
    </div>
  );
}
