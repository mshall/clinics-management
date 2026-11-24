import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/http";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import type { GrowthAccess } from "./growth-api";
import { downloadStatement, useStatementExports, useStatementV2 } from "./provider-marketing-api";
import { recentMonths } from "./provider-marketing-logic";

/** GRW-P2-C monthly statement v2: one line per visit with a decision, totals equal to the decision log and the charge ledger, CSV and PDF export. Admin only. */
export function CommissionStatements({ clinicId, access }: { clinicId: string; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = localeForLanguage(lang);
  const months = recentMonths(12);
  const [month, setMonth] = useState(months[0]!);
  const q = useStatementV2(access.level === "admin" ? clinicId : "", month);
  const exports = useStatementExports(month);
  const s = q.data;
  const money = (v: string | null) => (v == null ? "-" : formatMoneyAmount(Number(v), s?.currency ?? "EGP", locale));
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const run = async (kind: "csv" | "pdf") => {
    try { await downloadStatement(month, kind, clinicId); void exports.refetch(); } catch (e) { toast.error(e instanceof ApiError ? e.message : t("growth.pm.common.error")); }
  };
  if (access.level !== "admin") return <Card data-testid="statements-v2"><CardContent className="pt-6 text-sm text-muted-foreground">{t("growth.pm.statements.adminOnly")}</CardContent></Card>;
  return (
    <Card data-testid="statements-v2">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t("growth.pm.statements.title")}</CardTitle>
          <CardDescription>{t("growth.pm.statements.hint")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="stv2-month">{t("growth.pm.statements.month")}</Label>
            <select id="stv2-month" className="native-select h-10" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="stv2-month">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => void run("csv")} disabled={!s} data-testid="stv2-csv"><Download className="size-4" aria-hidden />{t("growth.pm.statements.csv")}</Button>
          <Button variant="outline" size="sm" onClick={() => void run("pdf")} disabled={!s} data-testid="stv2-pdf"><FileText className="size-4" aria-hidden />{t("growth.pm.statements.pdf")}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.pm.common.loading")}</p> : null}
        {q.isError ? <EmptyState tone="error" compact title={t("growth.pm.common.error")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("growth.pm.common.retry")}</Button>} /> : null}
        {s ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("growth.pm.statements.active")} ({s.totals.activeCount})</dt><dd className="text-xl font-semibold ltr-nums" data-testid="stv2-active">{money(s.totals.active)}</dd></div>
              <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("growth.pm.statements.reversed")}</dt><dd className="text-xl font-semibold ltr-nums">{money(s.totals.reversed)}</dd></div>
              <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("growth.pm.statements.waived")}</dt><dd className="text-xl font-semibold ltr-nums">{money(s.totals.waived)}</dd></div>
              <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{t("growth.pm.statements.providerLed")}</dt><dd className="text-xl font-semibold ltr-nums" data-testid="stv2-provider-led">{s.totals.providerLed.toLocaleString(locale)}</dd></div>
            </dl>
            {s.lines.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="stv2-empty">{t("growth.pm.statements.empty")}</p> : (
              <div className="overflow-x-auto">
                <Table data-testid="stv2-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("growth.pm.statements.date")}</TableHead><TableHead>{t("growth.pm.statements.origin")}</TableHead><TableHead>{t("growth.pm.statements.decision")}</TableHead>
                      <TableHead>{t("growth.pm.statements.amount")}</TableHead><TableHead>{t("growth.pm.statements.status")}</TableHead><TableHead>{t("growth.pm.statements.dispute")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.lines.map((l) => (
                      <TableRow key={l.appointmentId} data-testid="stv2-line">
                        <TableCell className="ltr-nums">{l.date}</TableCell>
                        <TableCell>{t(`growth.pm.statements.origins.${l.origin}`, { defaultValue: l.origin })}</TableCell>
                        <TableCell>{t(`growth.pm.statements.decisions.${l.decision}`)}</TableCell>
                        <TableCell className="ltr-nums">{money(l.amount)}</TableCell>
                        <TableCell>{l.chargeStatus ? t(`growth.pm.statements.chargeStatus.${l.chargeStatus}`, { defaultValue: l.chargeStatus }) : "-"}</TableCell>
                        <TableCell>{l.dispute ? t(`growth.pm.statements.disputeStatus.${l.dispute}`, { defaultValue: l.dispute }) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("growth.pm.statements.zone", { zone: s.zone })}</p>
          </>
        ) : null}
        <section aria-labelledby="stv2-exports">
          <h3 id="stv2-exports" className="mb-1 text-sm font-semibold">{t("growth.pm.statements.exports")}</h3>
          {exports.data?.items.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground" data-testid="stv2-exports">
              {exports.data.items.map((x) => <li key={x.id}><span className="font-medium">{x.kind}</span> · {new Date(x.createdAt).toLocaleString(locale)} · <span dir="ltr" className="font-mono">{x.checksum.slice(0, 12)}</span></li>)}
            </ul>
          ) : <p className="text-xs text-muted-foreground">{t("growth.pm.statements.noExports")}</p>}
        </section>
      </CardContent>
    </Card>
  );
}
