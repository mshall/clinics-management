import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiDownload } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { useRollup } from "./pay-api";
import { TD, TH, Tbl } from "./pay-ui";

const LEVELS = ["branch", "organisation", "psp", "day"] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Collections report from the Pay contract rollup: finance-only on the server; CSV and PDF downloads. */
export function PayRollupPanel() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("branch");
  const [from] = useState(() => iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to] = useState(() => iso(new Date(Date.now() + 86_400_000)));
  const q = useRollup(level, from, to);
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  return (
    <Card data-testid="pay-rollup">
      <CardHeader><CardTitle className="text-base">{t("pay.tabs.rollup")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("pay.rp.level")}>
          {LEVELS.map((l) => <Button key={l} type="button" role="radio" aria-checked={level === l} size="sm" className="min-h-11" variant={level === l ? "default" : "outline"} onClick={() => setLevel(l)}>{t(`pay.rp.${l}`)}</Button>)}
        </div>
        {q.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("pay.financeOnly")}</p> : null}
        {q.data && q.data.lines.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.rp.empty")}</p> : null}
        {q.data && q.data.lines.length > 0 ? (
          <Tbl label={t("pay.tabs.rollup")} testid="pay-rollup-table">
            <thead><tr><TH>{t("pay.rp.colGroup")}</TH><TH>{t("pay.rp.colCount")}</TH><TH>{t("pay.rp.colCaptured")}</TH><TH>{t("pay.rp.colRefunded")}</TH><TH>{t("pay.rp.colNet")}</TH></tr></thead>
            <tbody>{q.data.lines.map((l) => <tr key={`${l.key}-${l.currency}`}><TD className="ltr-nums">{l.key}</TD><TD className="ltr-nums">{l.count}</TD><TD className="ltr-nums">{formatMoneyAmount(l.capturedMinor / 100, l.currency, locale)}</TD><TD className="ltr-nums">{formatMoneyAmount(l.refundedMinor / 100, l.currency, locale)}</TD><TD className="ltr-nums">{formatMoneyAmount(l.netMinor / 100, l.currency, locale)}</TD></tr>)}</tbody>
          </Tbl>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(["csv", "pdf"] as const).map((f) => <Button key={f} size="sm" variant="outline" className="min-h-11" onClick={() => void apiDownload(`/api/v1/billing/pay/reports/rollup?level=${level}&from=${from}&to=${to}&lang=${lang}&format=${f}`, `collections-rollup.${f}`)}>{t(`pay.rp.${f}`)}</Button>)}
        </div>
      </CardContent>
    </Card>
  );
}
