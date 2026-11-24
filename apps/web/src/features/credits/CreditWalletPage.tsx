import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { CreditBanner } from "./CreditBanner";
import { CreditStatementPanel } from "./CreditStatementPanel";
import { useCreditWallet } from "./credits-api";
import { CREDIT_USES, daysUntil, lotsInSpendOrder } from "./credits-logic";

/** A table whose scroll area is keyboard-focusable and named (WCAG 2.1.1 / axe scrollable-region-focusable): on a 320 px screen the table scrolls sideways. */
function Tbl({ label, testid, children }: { label: string; testid: string; children: React.ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg"><table className="w-full text-sm" data-testid={testid}>{children}</table></div>;
}
const TH = ({ children }: { children: React.ReactNode }) => <th scope="col" className="h-10 whitespace-nowrap px-3 text-start font-medium text-muted-foreground">{children}</th>;
const TD = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <td className={`border-t p-3 align-middle ${className}`}>{children}</td>;

/** Provider credit (GRW-P2-W): balance, lots by expiry and category, what it can pay for, history. Read only; PROVIDER credit, never patients' money. */
export function CreditWalletPage() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [page, setPage] = useState(1);
  const q = useCreditWallet(page, 20);
  const w = q.data;
  const money = (v: string | number) => formatMoneyAmount(Number(v), w?.currency ?? "EGP", locale);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const expiry = (iso: string | null) => {
    const d = daysUntil(iso);
    return d === null ? t("credits.noExpiry") : d === 0 ? t("credits.expiresToday") : t("credits.expiresIn", { count: d });
  };
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("credits.loading")}</p>;
  if (q.isError || !w) return <EmptyState tone="error" compact title={t("credits.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("credits.retry")}</Button>} />;
  const lots = lotsInSpendOrder(w.lots ?? []);
  const kind = (e: { type: string }) => (e.type === "GRANT" ? t("credits.entryGrant") : e.type === "CONSUME" ? t("credits.entryConsume") : e.type === "EXPIRE" ? t("credits.entryExpire") : t("credits.entryReverse"));
  return (
    <div className="space-y-4" data-testid="credit-wallet">
      <CreditBanner />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" aria-hidden />{t("credits.title")}</CardTitle>
          <CardDescription>{t("credits.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("credits.balance")}</dt><dd className="text-2xl font-semibold ltr-nums" data-testid="credit-balance">{money(w.balance)}</dd></div>
            {Number(w.reserved ?? 0) > 0 ? <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("credits.reserved")}</dt><dd className="text-xl font-semibold ltr-nums" data-testid="credit-reserved">{money(w.reserved ?? 0)}</dd><p className="mt-1 text-xs text-muted-foreground">{t("credits.reservedHint")}</p></div> : null}
          </dl>
          {w.spendableByUse ? (
            <section aria-labelledby="credit-pay-h">
              <h3 id="credit-pay-h" className="mb-2 text-sm font-medium">{t("credits.canPay")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="credit-uses">
                {CREDIT_USES.map((u) => (
                  <li key={u} className="rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{t(`credits.uses.${u}`)}</span>
                    <span className="block text-xs text-muted-foreground">{w.canPayFor?.[u] ? t("credits.usable", { amount: money(w.spendableByUse![u]) }) : t("credits.notUsable")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("credits.lots")}</CardTitle><CardDescription>{t("credits.lotsHint")}</CardDescription></CardHeader>
        <CardContent>
          {lots.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="credit-lots-empty">{t("credits.lotsEmpty")}</p> : (
            <Tbl label={t("credits.lots")} testid="credit-lots">
              <thead><tr><TH>{t("credits.colAmount")}</TH><TH>{t("credits.colSource")}</TH><TH>{t("credits.colCategory")}</TH><TH>{t("credits.colExpires")}</TH></tr></thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <TD className="ltr-nums font-medium">{money(l.remaining)}</TD>
                    <TD>{t(`credits.reasons.${l.reason}`, { defaultValue: l.reason })}</TD>
                    <TD>{t(`credits.categories.${l.category}`)}</TD>
                    <TD>{expiry(l.expiresAt)}</TD>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          )}
        </CardContent>
      </Card>

      <CreditStatementPanel />

      <Card>
        <CardHeader><CardTitle className="text-base">{t("credits.history")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {w.entries.length === 0 ? <p className="text-sm text-muted-foreground">{t("credits.historyEmpty")}</p> : (
            <Tbl label={t("credits.history")} testid="credit-history">
              <thead><tr><TH>{t("credits.colDate")}</TH><TH>{t("credits.colWhat")}</TH><TH>{t("credits.colAmount")}</TH></tr></thead>
              <tbody>
                {w.entries.map((e) => (
                  <tr key={e.id}>
                    <TD>{date(e.createdAt)}</TD>
                    <TD>{kind(e)} · {t(`credits.reasons.${e.reason}`, { defaultValue: e.reason })}</TD>
                    <TD className="ltr-nums">{Number(e.amount) > 0 ? "+" : ""}{money(e.amount)}</TD>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          )}
          {w.total > w.pageSize ? (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
              <span className="text-xs text-muted-foreground ltr-nums">{page} / {Math.ceil(w.total / w.pageSize)}</span>
              <Button size="sm" variant="outline" disabled={page * w.pageSize >= w.total} onClick={() => setPage(page + 1)}>›</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
