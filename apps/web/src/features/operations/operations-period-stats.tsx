import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CircleDollarSign, ClipboardList, Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { OperationSummaryDto } from "@/lib/api-types";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";

type Props = {
  summary: OperationSummaryDto | undefined;
  loading: boolean;
  language: string;
};

function moneyLines(
  rows: { currency: string; amount: number }[],
  locale: string,
  loading: boolean,
): ReactNode {
  if (loading) return <span>…</span>;
  if (!rows.length) return <span className="ltr-nums">0</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <span key={row.currency} className="ltr-nums leading-tight">
          {formatMoneyAmount(row.amount, row.currency, locale)}
        </span>
      ))}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  children,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  accent: "sky" | "violet" | "emerald" | "amber";
}) {
  const accentClass = {
    sky: "border-sky-500/25 bg-sky-500/5 [&_svg]:text-sky-600 dark:[&_svg]:text-sky-400",
    violet: "border-violet-500/25 bg-violet-500/5 [&_svg]:text-violet-600 dark:[&_svg]:text-violet-400",
    emerald: "border-emerald-500/25 bg-emerald-500/5 [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400",
    amber: "border-amber-500/25 bg-amber-500/5 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400",
  }[accent];

  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 shadow-sm", accentClass)}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 shadow-sm">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 text-base font-semibold tracking-tight sm:text-lg">{children}</div>
      </div>
    </div>
  );
}

export function OperationsPeriodStats({ summary, loading, language }: Props) {
  const { t } = useTranslation();
  const loc = localeForLanguage(language);
  const lines = summary?.revenueByCurrency ?? [];

  const contractRows = lines.map((r) => ({ currency: r.currency, amount: r.contractTotal }));
  const paidRows = lines.map((r) => ({ currency: r.currency, amount: r.paidTotal }));
  const pendingRows = lines.map((r) => ({
    currency: r.currency,
    amount: Math.max(0, r.contractTotal - r.paidTotal),
  }));

  const totalOps = loading ? "…" : (summary?.totalOperations ?? 0).toLocaleString(loc);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile icon={ClipboardList} label={t("operations.summaryTotal", "Total operations")} accent="sky">
        <span className="ltr-nums">{totalOps}</span>
      </StatTile>
      <StatTile icon={Banknote} label={t("operations.summaryTotalAmount", "Total amount")} accent="violet">
        {moneyLines(contractRows, loc, loading)}
      </StatTile>
      <StatTile icon={CircleDollarSign} label={t("operations.summaryPaid", "Paid")} accent="emerald">
        {moneyLines(paidRows, loc, loading)}
      </StatTile>
      <StatTile icon={Hourglass} label={t("operations.summaryPending", "Pending payment")} accent="amber">
        {moneyLines(pendingRows, loc, loading)}
      </StatTile>
    </div>
  );
}