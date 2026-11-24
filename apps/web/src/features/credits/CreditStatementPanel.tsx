import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { useCreditSection } from "./credits-api";
import { recentMonths } from "./credits-logic";

/** The Credit section of the monthly statement, read from the append-only ledger (opening + added - used - expired = closing). */
export function CreditStatementPanel() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const months = recentMonths(12);
  const [month, setMonth] = useState(months[0]!);
  const q = useCreditSection(month);
  const s = q.data;
  const money = (v: string) => formatMoneyAmount(Number(v), s?.currency ?? "EGP", locale);
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const sum = (m: Record<string, string>) => Object.values(m).reduce((n, v) => n + Number(v), 0).toFixed(2);
  return (
    <Card data-testid="credit-statement">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <CardTitle className="text-base">{t("credits.statement")}</CardTitle>
        <div className="space-y-1">
          <Label htmlFor="credit-month">{t("credits.statementMonth")}</Label>
          <select id="credit-month" className="native-select h-10" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="credit-month">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("credits.loading")}</p> : null}
        {q.isError ? <p role="alert" className="text-sm text-destructive">{t("credits.loadError")}</p> : null}
        {s && s.empty ? <CardDescription>{t("credits.stEmpty")}</CardDescription> : null}
        {s && !s.empty ? (
          <div className="space-y-2">
          <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="credit-statement-rows">
            <Row label={t("credits.stOpening")} value={money(s.opening)} />
            <Row label={t("credits.stGrants")} value={money(sum(s.grantsByReason))} />
            {Number(s.returns) > 0 ? <Row label={t("credits.stReturns")} value={money(s.returns)} muted /> : null}
            <Row label={t("credits.stConsumed")} value={`-${money(s.consumed)}`} />
            {Object.entries(s.consumptionByUse).map(([u, v]) => <Row key={u} label={t(`credits.uses.${u}`, { defaultValue: u })} value={`-${money(v)}`} muted />)}
            {Number(s.expiries) > 0 ? <Row label={t("credits.stExpiries")} value={`-${money(s.expiries)}`} /> : null}
            <Row label={t("credits.stClosing")} value={money(s.closing)} strong />
          </dl>
          {s.reconciles ? <p className="text-xs text-muted-foreground">{t("credits.stReconciles")}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 ${muted ? "ms-4 border-dashed" : ""}`}>
      <dt className={muted ? "text-xs text-muted-foreground" : "text-sm"}>{label}</dt>
      <dd className={`ltr-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
