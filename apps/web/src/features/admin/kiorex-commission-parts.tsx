import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDownload, apiGet } from "@/lib/http";

/** COM-3 provider side (read only): settlement statement tab, disclosure blocks and the counsel status chip. No wording and no number is shipped here: the texts are Kiorex's, shown only when set. */
export type Disclosure = { rateDisclosure: { en: string; ar: string }; termsSummary: { en: string; ar: string } } | null;
export type CounselChip = { status: "NOT_REVIEWED" | "APPROVED_WITH_CONDITIONS" | "APPROVED" | "REJECTED" } | null;
export type RateParams = { graceDays: number | null; retryDays: number[] | null; invoiceDueDays: number | null; reminderDays: number[] | null; disputeWindowDays: number | null; savedMethodChargeAllowed: boolean | null };
type Payout = { payoutRef: string; paidAt: string | null; cashMinor: number; commissionDeductedMinor: number; bankReference: string | null; reconciliation: "MATCHED" | "UNMATCHED" | "DISPUTED" };
export type StatementData = {
  source: "KIOREX" | "LOCAL_MIRROR"; currency: string; period: { from: string; to: string; key?: string };
  onlineCollectionsMinor: number; cashVisitCommissionAccruedMinor: number; cashVisitCommissionNettedMinor: number; cashVisitCommissionOpenMinor: number; cashVisitCharges: number;
  cashBreakdown?: { cash: { accruedMinor: number; nettedMinor: number; charges: number }; cashTransfer: { accruedMinor: number; nettedMinor: number; charges: number } };
  unknownTender?: { charges: number; commissionMinor: number };
  deductions: { commissionMinor: number; feesMinor: number | null; refundsMinor: number | null; chargebacksMinor: number | null };
  netPayableMinor: number; paidByBankTransferMinor: number; payouts: Payout[]; reconciliation: "MATCHED" | "UNMATCHED" | "DISPUTED" | "NO_PAYOUT";
};

export function useMoney(currency: string) {
  const { i18n } = useTranslation();
  let fmt: Intl.NumberFormat;
  try { fmt = new Intl.NumberFormat(i18n.language, { style: "currency", currency }); } catch { fmt = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2 }); }
  return (minor: number | null) => (minor === null ? "—" : fmt.format(minor / 100));
}

/** The funds-flow review status of Kiorex for this market, as a chip. Status only: never the reviewer, the document or the conditions. */
export function CounselBadge({ counsel }: { counsel: CounselChip }) {
  const { t } = useTranslation();
  if (!counsel) return null;
  return <Badge variant={counsel.status === "APPROVED" ? "default" : "secondary"} data-testid="kxc-counsel" data-status={counsel.status}>{t("kiorexCom.counsel.label")}: {t(`kiorexCom.counsel.status.${counsel.status}`)}</Badge>;
}

/** The two disclosure texts exactly as Kiorex wrote them, in the user's language (the other language when only that one is set, marked with its own lang / dir). Nothing at all when the wording is not set. */
export function DisclosureBlocks({ disclosure }: { disclosure: Disclosure }) {
  const { t, i18n } = useTranslation();
  if (!disclosure) return null;
  const pref = i18n.language.startsWith("ar") ? "ar" : "en";
  const blocks = (["rateDisclosure", "termsSummary"] as const).map((k) => {
    const x = disclosure[k]; const lang = x[pref].trim() ? pref : x[pref === "ar" ? "en" : "ar"].trim() ? (pref === "ar" ? "en" : "ar") : null;
    return lang ? { k, lang, text: x[lang] } : null;
  }).filter((b): b is { k: "rateDisclosure" | "termsSummary"; lang: "en" | "ar"; text: string } => b !== null);
  if (!blocks.length) return null;
  return (
    <div className="space-y-3" data-testid="kxc-disclosure">
      {blocks.map((b) => (
        <section key={b.k} className="rounded-lg border p-3" data-testid={`kxc-disclosure-${b.k}`}>
          <h4 className="text-sm font-semibold">{t(`kiorexCom.disclosure.${b.k}`)}</h4>
          <p className="mt-1 whitespace-pre-line text-sm" lang={b.lang} dir={b.lang === "ar" ? "rtl" : "ltr"}>{b.text}</p>
        </section>
      ))}
    </div>
  );
}

/** The collection parameters Kiorex configured on the rate in force; each shown only when set. */
export function RateParamsList({ params }: { params: RateParams | null | undefined }) {
  const { t } = useTranslation();
  if (!params) return null;
  const list = (v: number[] | null) => (v && v.length ? v.join(", ") : null);
  const rows: [string, string | null][] = [
    ["disputeWindowDays", params.disputeWindowDays === null ? null : t("kiorexCom.params.days", { count: params.disputeWindowDays })], ["invoiceDueDays", params.invoiceDueDays === null ? null : t("kiorexCom.params.days", { count: params.invoiceDueDays })],
    ["graceDays", params.graceDays === null ? null : t("kiorexCom.params.days", { count: params.graceDays })], ["retryDays", list(params.retryDays)], ["reminderDays", list(params.reminderDays)],
    ["savedMethodChargeAllowed", params.savedMethodChargeAllowed === null ? null : t(params.savedMethodChargeAllowed ? "kiorexCom.params.yes" : "kiorexCom.params.no")],
  ];
  const set = rows.filter((r): r is [string, string] => r[1] !== null);
  if (!set.length) return null;
  return (
    <section data-testid="kxc-rate-params"><h3 className="text-sm font-semibold">{t("kiorexCom.params.title")}</h3>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{set.map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{t(`kiorexCom.params.${k}`)}</dt><dd className="mt-1 text-sm font-semibold" dir="ltr">{v}</dd></div>)}</dl>
    </section>
  );
}

/** A table that scrolls sideways inside a keyboard-focusable, labelled region (small screens), instead of widening the page. */
export function ScrollTable({ label, minWidth = "40rem", children }: { label: string; minWidth?: string; children: ReactNode }) {
  return <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={label}><table className="w-full text-sm" style={{ minWidth }}>{children}</table></div>;
}
const reconVariant = (s: string) => (s === "MATCHED" ? "default" : "secondary");
/** Settlement statement of one period: the same figures Kiorex finance sees. Providers are paid by bank transfer only; Kiorex never holds or pays cash. */
export function SettlementStatement({ base, period }: { base: string; period: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["billing", "kiorex-com", "settlement", period], queryFn: () => apiGet<StatementData>(`${base}/statement?period=${period}`), retry: false });
  const s = q.data; const money = useMoney(s?.currency ?? "EGP");
  const fail = () => toast.error(t("common.error", { defaultValue: "Something went wrong" }));
  if (q.isLoading) return <p className="text-sm text-muted-foreground" role="status">{t("kiorexCom.stmt.loading")}</p>;
  if (q.isError || !s) return <p role="alert" className="text-sm" data-testid="kxc-stmt-unavailable">{t("kiorexCom.stmt.unavailable")}</p>;
  const cards: [string, string][] = [
    ["online", money(s.onlineCollectionsMinor)], ["cashAccrued", money(s.cashVisitCommissionAccruedMinor)], ["cashNetted", money(s.cashVisitCommissionNettedMinor)], ["cashOpen", money(s.cashVisitCommissionOpenMinor)],
    ...(s.cashBreakdown ? ([["cashOnlyAccrued", money(s.cashBreakdown.cash.accruedMinor)], ["cashTransferAccrued", money(s.cashBreakdown.cashTransfer.accruedMinor)], ["cashTransferNetted", money(s.cashBreakdown.cashTransfer.nettedMinor)]] as [string, string][]) : []),
    ...(s.unknownTender ? ([["unknownTender", String(s.unknownTender.charges)]] as [string, string][]) : []),
    ["dedCommission", money(s.deductions.commissionMinor)], ["dedFees", money(s.deductions.feesMinor)], ["dedRefunds", money(s.deductions.refundsMinor)], ["dedChargebacks", money(s.deductions.chargebacksMinor)],
    ["net", money(s.netPayableMinor)], ["paid", money(s.paidByBankTransferMinor)],
  ];
  return (
    <section className="space-y-4" data-testid="kxc-statement" aria-label={t("kiorexCom.stmt.title")}>
      <p className="text-sm text-muted-foreground" data-testid="kxc-stmt-source" data-source={s.source}>{t(`kiorexCom.stmt.source.${s.source}`)}</p>
      <p className="text-sm">{t("kiorexCom.stmt.bankOnly")}</p>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">{t("kiorexCom.stmt.reconciliation")}</span><Badge variant={reconVariant(s.reconciliation)} data-testid="kxc-stmt-recon" data-status={s.reconciliation}>{t(`kiorexCom.stmt.recon.${s.reconciliation}`)}</Badge>
        <Button variant="outline" onClick={() => void apiDownload(`${base}/statement/${period}/export.csv`, `settlement-${period}.csv`).catch(fail)} data-testid="kxc-stmt-csv">{t("kiorexCom.export")}</Button></div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="kxc-stmt-cards">{cards.map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border p-3" data-testid={`kxc-stmt-${k}`}><dt className="text-xs text-muted-foreground">{t(`kiorexCom.stmt.cards.${k}`)}</dt><dd className="mt-1 text-base font-semibold tabular-nums" dir="ltr">{v}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">{t("kiorexCom.stmt.cashNote", { count: s.cashVisitCharges })}</p>
      <h3 className="text-sm font-semibold">{t("kiorexCom.stmt.payouts")}</h3>
      {s.payouts.length ? (
        <ScrollTable label={t("kiorexCom.stmt.payouts")} minWidth="34rem"><TableHeader><TableRow><TableHead>{t("kiorexCom.col.payout")}</TableHead><TableHead>{t("kiorexCom.col.at")}</TableHead><TableHead>{t("kiorexCom.col.cash")}</TableHead><TableHead>{t("kiorexCom.col.deducted")}</TableHead><TableHead>{t("kiorexCom.stmt.bankRef")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead></TableRow></TableHeader>
          <TableBody>{s.payouts.map((p) => <TableRow key={p.payoutRef}><TableCell dir="ltr">{p.payoutRef}</TableCell><TableCell dir="ltr">{p.paidAt?.slice(0, 10) ?? "—"}</TableCell><TableCell dir="ltr">{money(p.cashMinor)}</TableCell><TableCell dir="ltr">{money(p.commissionDeductedMinor)}</TableCell><TableCell dir="ltr">{p.bankReference ?? "—"}</TableCell><TableCell><Badge variant={reconVariant(p.reconciliation)}>{t(`kiorexCom.stmt.recon.${p.reconciliation}`)}</Badge></TableCell></TableRow>)}</TableBody></ScrollTable>
      ) : <p className="text-sm text-muted-foreground">{t("kiorexCom.stmt.noPayouts")}</p>}
    </section>
  );
}
