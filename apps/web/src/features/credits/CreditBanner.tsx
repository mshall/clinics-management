import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { useCreditWallet } from "./credits-api";
import { expiringSoon } from "./credits-logic";

/** Shown only when credit is about to lapse. Quiet, informational, no countdown pressure. */
export function CreditBanner() {
  const { t, i18n } = useTranslation();
  const q = useCreditWallet(1, 1);
  const w = q.data;
  const soon = w?.lots ? expiringSoon(w.lots) : null;
  if (!w || !soon) return null;
  const amount = formatMoneyAmount(soon.amount, w.currency, localeForLanguage(i18n.language));
  return (
    <div role="status" data-testid="credit-banner" className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
      <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>{soon.days === 0 ? t("credits.bannerExpiringToday", { amount }) : t("credits.bannerExpiring", { amount, count: soon.days })}</p>
    </div>
  );
}
