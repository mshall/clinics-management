import { useTranslation } from "react-i18next";
import { StatCard } from "@/brand/ui-kit";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { budgetUsedPct, minorToUnits, type PromotionView } from "./promotions-logic";

/** Budget, burn and the bookings by state of one promotion. Plain numbers and a labelled bar (no colour-only meaning). */
export function PromotionBudgetCard({ p }: { p: PromotionView }) {
  const { t, i18n } = useTranslation(); const locale = localeForLanguage(i18n.language);
  const money = (minor: number) => formatMoneyAmount(minorToUnits(minor), "EGP", locale);
  const pct = budgetUsedPct(p.budget);
  return (
    <section aria-label={t("promotions.budgetTitle")} className="space-y-3" data-testid={`promo-budget-${p.id}`}>
      <div className="flex items-center justify-between text-sm"><span>{t("promotions.budgetOf", { used: money(p.budget.exposureMinor), cap: money(p.budget.capMinor) })}</span><span className="ltr-nums text-muted-foreground">{pct}%</span></div>
      <div role="progressbar" aria-label={t("promotions.burn")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label={t("promotions.reserved")} value={<span className="ltr-nums" data-testid="promo-reserved">{money(p.budget.reservedMinor)}</span>} />
        <StatCard label={t("promotions.debited")} value={<span className="ltr-nums" data-testid="promo-debited">{money(p.budget.debitedMinor)}</span>} />
        <StatCard label={t("promotions.remaining")} value={<span className="ltr-nums" data-testid="promo-remaining">{money(p.budget.remainingMinor)}</span>} />
      </div>
    </section>
  );
}
