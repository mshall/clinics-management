import { PiggyBank } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppointmentDepositView } from "@/lib/api-types";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  PENDING: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  HELD: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  APPLIED: "border-kx-ocean-300 bg-kx-ocean-50 text-kx-ocean-950 dark:border-kx-ocean-800 dark:bg-kx-ocean-950 dark:text-kx-ocean-100",
  RELEASED: "border-muted bg-muted text-muted-foreground",
  FORFEITED: "border-muted bg-muted text-muted-foreground",
};

/** KX-07 / FS-04 — deposit status on an appointment ("Deposit 100 EGP paid · Kiorex Pay"). */
export function DepositBadge({ deposit, className }: { deposit: AppointmentDepositView | null | undefined; className?: string }) {
  const { t, i18n } = useTranslation();
  if (!deposit) return null;
  const locale = localeForLanguage(i18n.language);
  const amount = deposit.amount > 0 ? formatMoneyAmount(deposit.amount, deposit.currency, locale) : "";
  const status = t(`depositBadge.status.${deposit.status}`, deposit.status);
  const source = t(`depositBadge.source.${deposit.source}`, deposit.source);
  return (
    <span
      data-testid="deposit-badge"
      data-status={deposit.status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[deposit.status] ?? TONE.RELEASED,
        className,
      )}
    >
      <PiggyBank className="h-3 w-3" aria-hidden />
      <span>
        {t("depositBadge.label", "Deposit")} {amount ? <span className="ltr-nums">{amount}</span> : null} · {status} · {source}
      </span>
    </span>
  );
}
