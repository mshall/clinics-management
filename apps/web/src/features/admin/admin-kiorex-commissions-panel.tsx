import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDownload, apiGet } from "@/lib/http";
import { CounselBadge, DisclosureBlocks, RateParamsList, ScrollTable, SettlementStatement, type CounselChip, type Disclosure, type RateParams } from "./kiorex-commission-parts";

type Summary = { collection: { claims: string; collected: string; deductedFromPayouts: string; invoiced: string; invoicePaid: string; invoiceOpen: string }; openDisputes: number };
type LedgerRow = { id: string; attendedAt: string; clinician: string; amount: string; currency: string; status: string; decision: { kind: string; policyVersion: string; feeBasis: string | null; sponsoredDiscount: string | null; basisPolicyVersion: string | null } | null; collection: { id: string; periodKey: string; claimStatus?: string } | null; tender?: "CASH" | "ONLINE" | null; disputeStatus?: string | null; disputeDeadline?: string | null; rateSource?: string | null; rateSnapshot?: { version?: number; source?: string } | null };
type Run = { id: string; periodKey: string; status: string; mode: string; modeRequested: string | null; fallbackReason: string | null; provider: string | null; currency: string; claims: string; collected: string; deducted: string; invoiced: string; paid: string; open: string; invoiceNo: string | null };
type RunDetail = Run & { balanced: boolean; timeline: Array<{ at: string; event: string }> };
type Ded = { payoutRef: string; paidAt: string; gross: string; cash: string; commissionDeducted: string; currency: string };
type Disp = { id: string; appointmentId: string; reason: string; status: string; resolution: string | null; amount: string; currency: string; createdAt: string };
const TABS = ["summary", "ledger", "collections", "deductions", "disputes", "rate", "settlement"] as const;
type RateSpec = { feeType: "PERCENT" | "FLAT"; percentBps: number | null; flatMinor: number | null; minMinor: number | null; maxMinor: number | null; mode: string | null };
type RateEff = { state: "SET" | "NOT_SET"; source: "OVERRIDE" | "DEFAULT" | null; version: number | null; effectiveFrom: string | null; reason: string | null; spec: RateSpec | null };
type RateHist = { version: number; scope: "DEFAULT" | "ORG"; kind: "RATE" | "INHERIT"; effectiveFrom: string; reason: string | null; spec: RateSpec | null };
type RateView = { known: boolean; state: "SET" | "NOT_SET"; effective: RateEff; default: RateEff; override: RateEff | null; inheriting: boolean; upcoming: RateHist | null; history: RateHist[]; receivedAt: string | null; disclosure?: Disclosure; counsel?: CounselChip; params?: RateParams };
const B = "/api/v1/billing/kiorex-commissions";
const month = () => new Date().toISOString().slice(0, 7);

/** COM-2: one rate in words. Kiorex sets it; this clinic only reads it. Amounts are minor units, percent is in basis points. */
function RateText({ spec }: { spec: RateSpec | null }) {
  const { t, i18n } = useTranslation();
  if (!spec) return <Badge variant="secondary" data-testid="kxc-rate-not-set">{t("kiorexCom.rate.notSet")}</Badge>;
  const money = (n: number) => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EGP" }).format(n / 100);
  const base = spec.feeType === "PERCENT" ? t("kiorexCom.rate.percentOf", { pct: new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 2 }).format((spec.percentBps ?? 0) / 10_000) }) : t("kiorexCom.rate.flatPer", { amount: money(spec.flatMinor ?? 0) });
  const bounds = [spec.minMinor != null ? `${t("kiorexCom.rate.min")} ${money(spec.minMinor)}` : null, spec.maxMinor != null ? `${t("kiorexCom.rate.max")} ${money(spec.maxMinor)}` : null].filter(Boolean).join(", ");
  return <span>{base}{bounds ? ` (${bounds})` : ""}</span>;
}

/** COM-1: Admin > Billing > Kiorex commissions. Finance (and owner / group admin, and administrators when the organization enables it); renders nothing for anyone else. */
export function AdminKiorexCommissionsPanel({ standalone = false }: { standalone?: boolean } = {}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>("summary");
  const [period, setPeriod] = useState(month());
  const [run, setRun] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const access = useQuery({ queryKey: ["billing", "kiorex-com", "access"], queryFn: () => apiGet<{ canView: boolean }>(`${B}/access`) });
  const enabled = access.data?.canView === true;
  const useCom = <T,>(key: string, path: string) => useQuery({ queryKey: ["billing", "kiorex-com", key, period], queryFn: () => apiGet<T>(path), enabled: enabled && tab === (key as string) });
  const summary = useCom<Summary>("summary", `${B}/summary?period=${period}`);
  const ledger = useCom<{ items: LedgerRow[] }>("ledger", `${B}/ledger?period=${period}`);
  const cols = useCom<{ items: Run[] }>("collections", `${B}/collections`);
  const deds = useCom<{ items: Ded[] }>("deductions", `${B}/deductions`);
  const disp = useCom<{ items: Disp[] }>("disputes", `${B}/disputes`);
  const rate = useCom<RateView>("rate", `${B}/rate`);
  const detail = useQuery({ queryKey: ["billing", "kiorex-com", "run", run], queryFn: () => apiGet<RunDetail>(`${B}/collections/${run}`), enabled: enabled && !!run });
  const chargeTl = useQuery({ queryKey: ["billing", "kiorex-com", "charge-tl", chargeId], queryFn: () => apiGet<{ status: string; events: Array<{ at: string; source: string; event: string }> }>(`${B}/charges/${chargeId}/timeline`), enabled: enabled && !!chargeId });
  if (!enabled) return standalone && access.isFetched ? <p role="alert" className="text-sm text-muted-foreground" data-testid="kxc-no-access">{t("kiorexCom.noAccess")}</p> : null;
  const st = (s: string) => <Badge variant={["CONFIRMED", "COLLECTED", "SETTLED", "PAID", "APPROVED"].includes(s) ? "default" : "secondary"}>{t(`kiorexCom.status.${s}`, { defaultValue: s })}</Badge>;
  const fail = () => toast.error(t("common.error", { defaultValue: "Something went wrong" }));
  const csv = (view: string) => void apiDownload(`${B}/export/${view}.csv?period=${period}`, `kiorex-commissions-${view}.csv`).catch(fail);
  return (
    <Card data-testid="kiorex-commissions-panel">
      <CardHeader>
        <CardTitle>{t("kiorexCom.title")}</CardTitle>
        <CardDescription>{t("kiorexCom.description")}</CardDescription>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div><Label htmlFor="kxc-period">{t("kiorexCom.period")}</Label><Input id="kxc-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" /></div>
          <Button variant="outline" onClick={() => void apiDownload(`${B}/statement/${period}.pdf`, `kiorex-commissions-${period}.pdf`).catch(fail)} data-testid="kxc-pdf">{t("kiorexCom.statement")}</Button>
          {tab !== "summary" && tab !== "rate" && tab !== "settlement" && <Button variant="outline" onClick={() => csv(tab === "collections" ? "collections" : tab === "deductions" ? "deductions" : tab === "disputes" ? "disputes" : "ledger")} data-testid="kxc-csv">{t("kiorexCom.export")}</Button>}
        </div>
        <div role="tablist" aria-label={t("kiorexCom.title")} className="flex flex-wrap gap-1.5 pt-2">
          {TABS.map((x) => <button key={x} role="tab" aria-selected={tab === x} data-testid={`kxc-tab-${x}`} onClick={() => { setTab(x); setRun(null); }} className={`min-h-11 rounded-md border px-3 text-sm ${tab === x ? "bg-primary text-primary-foreground" : "bg-background"}`}>{t(`kiorexCom.tabs.${x}`)}</button>)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tab === "summary" && summary.data && (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="kxc-cards">
            {([["claims", summary.data.collection.claims], ["collected", summary.data.collection.collected], ["deducted", summary.data.collection.deductedFromPayouts], ["invoiced", summary.data.collection.invoiced], ["paid", summary.data.collection.invoicePaid], ["open", summary.data.collection.invoiceOpen], ["disputes", String(summary.data.openDisputes)]] as const).map(([k, v]) => <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{t(`kiorexCom.cards.${k}`)}</dt><dd className="text-lg font-semibold tabular-nums" dir="ltr">{v}</dd></div>)}
          </dl>
        )}
        {tab === "ledger" && (ledger.data?.items.length ? (
          <ScrollTable label={t("kiorexCom.tabs.ledger")} minWidth="64rem"><TableHeader><TableRow><TableHead>{t("kiorexCom.col.date")}</TableHead><TableHead>{t("kiorexCom.col.doctor")}</TableHead><TableHead>{t("kiorexCom.col.amount")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead><TableHead>{t("kiorexCom.col.basis")}</TableHead><TableHead>{t("kiorexCom.col.sponsored")}</TableHead><TableHead>{t("kiorexCom.col.policy")}</TableHead><TableHead>{t("kiorexCom.col.collection")}</TableHead><TableHead>{t("kiorexCom.col.tender")}</TableHead><TableHead>{t("kiorexCom.col.dispute")}</TableHead><TableHead>{t("kiorexCom.col.rateUsed")}</TableHead><TableHead><span className="sr-only">{t("kiorexCom.timeline")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{ledger.data.items.map((r) => <TableRow key={r.id}><TableCell>{r.attendedAt.slice(0, 10)}</TableCell><TableCell>{r.clinician}</TableCell><TableCell className="tabular-nums" dir="ltr">{r.amount} {r.currency}</TableCell><TableCell>{st(r.status)}</TableCell><TableCell dir="ltr">{r.decision?.feeBasis ?? "-"}</TableCell><TableCell dir="ltr">{r.decision?.sponsoredDiscount ?? "-"}</TableCell><TableCell dir="ltr" className="text-xs">{r.decision?.policyVersion ?? "-"}</TableCell><TableCell>{r.collection ? <button className="underline" onClick={() => { setTab("collections"); setRun(r.collection!.id); }}>{r.collection.periodKey} {r.collection.claimStatus ? t(`kiorexCom.status.${r.collection.claimStatus}`, { defaultValue: r.collection.claimStatus }) : ""}</button> : "-"}</TableCell>
              <TableCell data-testid="kxc-ledger-tender">{r.tender ? t(`kiorexCom.tender.${r.tender}`) : t("kiorexCom.tender.NONE")}</TableCell>
              <TableCell data-testid="kxc-ledger-dispute">{r.disputeStatus ? <>{t(`kiorexCom.status.${r.disputeStatus}`, { defaultValue: r.disputeStatus })}{r.disputeDeadline ? <span className="block text-xs text-muted-foreground" dir="ltr">{t("kiorexCom.dispute.until", { date: r.disputeDeadline.slice(0, 10) })}</span> : null}</> : r.disputeDeadline ? <span className="text-xs text-muted-foreground" dir="ltr">{t("kiorexCom.dispute.until", { date: r.disputeDeadline.slice(0, 10) })}</span> : "-"}</TableCell>
              <TableCell data-testid="kxc-ledger-rate" className="text-xs">{r.rateSource ? t(`kiorexCom.rate.sourceCode.${r.rateSource}`, { defaultValue: r.rateSource }) : "-"}{r.rateSnapshot?.version != null ? <span dir="ltr"> v{r.rateSnapshot.version}</span> : null}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setChargeId(chargeId === r.id ? null : r.id)} aria-expanded={chargeId === r.id} data-testid="kxc-charge-timeline-btn">{t("kiorexCom.timeline")}</Button></TableCell></TableRow>)}</TableBody></ScrollTable>
        ) : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>)}
        {tab === "ledger" && chargeId && chargeTl.data && (
          <section className="rounded-lg border p-4" data-testid="kxc-charge-timeline" aria-label={t("kiorexCom.timeline")}>
            <h3 className="font-semibold">{t("kiorexCom.timeline")} {st(chargeTl.data.status)}</h3>
            {chargeTl.data.events.length ? <ol className="mt-2 text-sm">{chargeTl.data.events.map((e, i) => <li key={`${e.at}${i}`}><span className="text-muted-foreground" dir="ltr">{e.at.slice(0, 16).replace("T", " ")}</span> {e.event}</li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>}
          </section>
        )}
        {tab === "collections" && (<>
          {cols.data?.items.length ? <Table><TableHeader><TableRow><TableHead>{t("kiorexCom.col.period")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead><TableHead>{t("kiorexCom.col.mode")}</TableHead><TableHead>{t("kiorexCom.col.provider")}</TableHead><TableHead>{t("kiorexCom.cards.claims")}</TableHead><TableHead>{t("kiorexCom.cards.collected")}</TableHead><TableHead>{t("kiorexCom.cards.deducted")}</TableHead><TableHead>{t("kiorexCom.cards.open")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{cols.data.items.map((r) => <TableRow key={r.id}><TableCell dir="ltr">{r.periodKey}</TableCell><TableCell>{st(r.status)}</TableCell><TableCell>{t(`kiorexCom.modes.${r.mode}`, { defaultValue: r.mode })}</TableCell><TableCell>{r.provider ?? "-"}</TableCell><TableCell dir="ltr">{r.claims}</TableCell><TableCell dir="ltr">{r.collected}</TableCell><TableCell dir="ltr">{r.deducted}</TableCell><TableCell dir="ltr">{r.open}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setRun(r.id)}>{t("kiorexCom.detail")}</Button></TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>}
          {run && detail.data && (
            <section className="rounded-lg border p-4" data-testid="kxc-run-detail">
              <div className="flex items-center justify-between"><h3 className="font-semibold" dir="ltr">{detail.data.periodKey} {st(detail.data.status)}</h3><Button size="sm" variant="outline" onClick={() => setRun(null)}>{t("kiorexCom.close")}</Button></div>
              {detail.data.fallbackReason && detail.data.modeRequested && <p className="mt-2 text-sm" data-testid="kxc-fallback">{t("kiorexCom.fallbackNote", { requested: t(`kiorexCom.modes.${detail.data.modeRequested}`, { defaultValue: detail.data.modeRequested }), reason: detail.data.fallbackReason })}</p>}
              {detail.data.balanced && <p className="mt-2 text-sm text-muted-foreground">{t("kiorexCom.balanced")}</p>}
              <h4 className="mt-3 text-sm font-semibold">{t("kiorexCom.timeline")}</h4>
              <ol className="text-sm" data-testid="kxc-timeline">{detail.data.timeline.map((e, i) => <li key={`${e.at}${i}`}><span className="text-muted-foreground" dir="ltr">{e.at.slice(0, 16).replace("T", " ")}</span> {e.event}</li>)}</ol>
            </section>
          )}
        </>)}
        {tab === "deductions" && (deds.data?.items.length ? <Table><TableHeader><TableRow><TableHead>{t("kiorexCom.col.payout")}</TableHead><TableHead>{t("kiorexCom.col.gross")}</TableHead><TableHead>{t("kiorexCom.col.deducted")}</TableHead><TableHead>{t("kiorexCom.col.cash")}</TableHead></TableRow></TableHeader><TableBody>{deds.data.items.map((r) => <TableRow key={r.payoutRef}><TableCell dir="ltr">{r.payoutRef}</TableCell><TableCell dir="ltr">{r.gross} {r.currency}</TableCell><TableCell dir="ltr">{r.commissionDeducted}</TableCell><TableCell dir="ltr">{r.cash}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>)}
        {tab === "rate" && rate.data && (
          <section className="space-y-4" data-testid="kxc-rate" aria-label={t("kiorexCom.rate.title")}>
            <p className="text-sm text-muted-foreground">{t("kiorexCom.rate.hint")}</p>
            <CounselBadge counsel={rate.data.counsel ?? null} />
            <DisclosureBlocks disclosure={rate.data.disclosure ?? null} />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="min-w-0 rounded-lg border p-3" data-testid="kxc-rate-effective"><div className="text-xs text-muted-foreground">{t("kiorexCom.rate.effective")}</div>
                <div className="mt-1 text-lg font-semibold"><RateText spec={rate.data.effective.spec} /></div>
                {rate.data.effective.state === "SET" ? <div className="mt-1 text-xs text-muted-foreground">{t(`kiorexCom.rate.source.${rate.data.effective.source}`)} · v{rate.data.effective.version}{rate.data.effective.reason ? ` · ${rate.data.effective.reason}` : ""}{rate.data.effective.spec?.mode ? ` · ${t(`kiorexCom.modes.${rate.data.effective.spec.mode}`, { defaultValue: rate.data.effective.spec.mode })}` : ""}</div> : <div className="mt-1 text-xs text-muted-foreground">{t("kiorexCom.rate.notSetHint")}</div>}</div>
              <div className="min-w-0 rounded-lg border p-3" data-testid="kxc-rate-default"><div className="text-xs text-muted-foreground">{t("kiorexCom.rate.default")}</div><div className="mt-1 text-sm font-semibold"><RateText spec={rate.data.default.spec} /></div></div>
              <div className="min-w-0 rounded-lg border p-3" data-testid="kxc-rate-override"><div className="text-xs text-muted-foreground">{t("kiorexCom.rate.override")}</div><div className="mt-1 text-sm font-semibold">{rate.data.override ? <RateText spec={rate.data.override.spec} /> : t("kiorexCom.rate.inheriting")}</div></div>
            </div>
            {rate.data.upcoming && <p className="text-sm" data-testid="kxc-rate-upcoming">{t("kiorexCom.rate.upcoming")}: {rate.data.upcoming.kind === "INHERIT" ? t("kiorexCom.rate.backToDefault") : <RateText spec={rate.data.upcoming.spec} />} · <span dir="ltr">{rate.data.upcoming.effectiveFrom.slice(0, 10)}</span></p>}
            <RateParamsList params={rate.data.params} />
            <h3 className="text-sm font-semibold">{t("kiorexCom.rate.history")}</h3>
            {rate.data.history.length ? (
              <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={t("kiorexCom.rate.history")}>
                <table className="w-full min-w-[28rem] text-sm"><thead className="bg-muted/40"><tr className="border-b text-start"><th scope="col" className="h-10 px-3 text-start font-medium">{t("kiorexCom.rate.colFrom")}</th><th scope="col" className="h-10 px-3 text-start font-medium">{t("kiorexCom.rate.colScope")}</th><th scope="col" className="h-10 px-3 text-start font-medium">{t("kiorexCom.rate.colRate")}</th><th scope="col" className="h-10 px-3 text-start font-medium">{t("kiorexCom.rate.colReason")}</th></tr></thead>
                  <tbody>{rate.data.history.map((h) => <tr key={`${h.scope}${h.version}`} className="border-b"><td className="p-3" dir="ltr">{h.effectiveFrom.slice(0, 10)}</td><td className="p-3">{t(`kiorexCom.rate.scope${h.scope}`)}</td><td className="p-3">{h.kind === "INHERIT" ? t("kiorexCom.rate.backToDefault") : <RateText spec={h.spec} />}</td><td className="p-3">{h.reason ?? "-"}</td></tr>)}</tbody></table>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>}
          </section>
        )}
        {tab === "settlement" && <SettlementStatement base={B} period={period} />}
        {tab === "disputes" && (disp.data?.items.length ? <Table><TableHeader><TableRow><TableHead>{t("kiorexCom.col.date")}</TableHead><TableHead>{t("kiorexCom.col.reason")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead><TableHead>{t("kiorexCom.col.amount")}</TableHead><TableHead>{t("kiorexCom.col.resolution")}</TableHead></TableRow></TableHeader><TableBody>{disp.data.items.map((r) => <TableRow key={r.id}><TableCell>{r.createdAt.slice(0, 10)}</TableCell><TableCell>{r.reason}</TableCell><TableCell>{st(r.status)}</TableCell><TableCell dir="ltr">{r.amount} {r.currency}</TableCell><TableCell>{r.resolution ?? "-"}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>)}
      </CardContent>
    </Card>
  );
}
