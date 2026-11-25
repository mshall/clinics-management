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

type Summary = { collection: { claims: string; collected: string; deductedFromPayouts: string; invoiced: string; invoicePaid: string; invoiceOpen: string }; openDisputes: number };
type LedgerRow = { id: string; attendedAt: string; clinician: string; amount: string; currency: string; status: string; decision: { kind: string; policyVersion: string; feeBasis: string | null; sponsoredDiscount: string | null; basisPolicyVersion: string | null } | null; collection: { id: string; periodKey: string; claimStatus?: string } | null };
type Run = { id: string; periodKey: string; status: string; mode: string; modeRequested: string | null; fallbackReason: string | null; provider: string | null; currency: string; claims: string; collected: string; deducted: string; invoiced: string; paid: string; open: string; invoiceNo: string | null };
type RunDetail = Run & { balanced: boolean; timeline: Array<{ at: string; event: string }> };
type Ded = { payoutRef: string; paidAt: string; gross: string; cash: string; commissionDeducted: string; currency: string };
type Disp = { id: string; appointmentId: string; reason: string; status: string; resolution: string | null; amount: string; currency: string; createdAt: string };
const TABS = ["summary", "ledger", "collections", "deductions", "disputes"] as const;
const B = "/billing/kiorex-commissions";
const month = () => new Date().toISOString().slice(0, 7);

/** COM-1: Admin > Billing > Kiorex commissions. Finance (and owner / group admin, and administrators when the organization enables it); renders nothing for anyone else. */
export function AdminKiorexCommissionsPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>("summary");
  const [period, setPeriod] = useState(month());
  const [run, setRun] = useState<string | null>(null);
  const access = useQuery({ queryKey: ["billing", "kiorex-com", "access"], queryFn: () => apiGet<{ canView: boolean }>(`${B}/access`) });
  const enabled = access.data?.canView === true;
  const useCom = <T,>(key: string, path: string) => useQuery({ queryKey: ["billing", "kiorex-com", key, period], queryFn: () => apiGet<T>(path), enabled: enabled && tab === (key as string) });
  const summary = useCom<Summary>("summary", `${B}/summary?period=${period}`);
  const ledger = useCom<{ items: LedgerRow[] }>("ledger", `${B}/ledger?period=${period}`);
  const cols = useCom<{ items: Run[] }>("collections", `${B}/collections`);
  const deds = useCom<{ items: Ded[] }>("deductions", `${B}/deductions`);
  const disp = useCom<{ items: Disp[] }>("disputes", `${B}/disputes`);
  const detail = useQuery({ queryKey: ["billing", "kiorex-com", "run", run], queryFn: () => apiGet<RunDetail>(`${B}/collections/${run}`), enabled: enabled && !!run });
  if (!enabled) return null;
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
          {tab !== "summary" && <Button variant="outline" onClick={() => csv(tab === "collections" ? "collections" : tab === "deductions" ? "deductions" : tab === "disputes" ? "disputes" : "ledger")} data-testid="kxc-csv">{t("kiorexCom.export")}</Button>}
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
          <Table><TableHeader><TableRow><TableHead>{t("kiorexCom.col.date")}</TableHead><TableHead>{t("kiorexCom.col.doctor")}</TableHead><TableHead>{t("kiorexCom.col.amount")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead><TableHead>{t("kiorexCom.col.basis")}</TableHead><TableHead>{t("kiorexCom.col.sponsored")}</TableHead><TableHead>{t("kiorexCom.col.policy")}</TableHead><TableHead>{t("kiorexCom.col.collection")}</TableHead></TableRow></TableHeader>
            <TableBody>{ledger.data.items.map((r) => <TableRow key={r.id}><TableCell>{r.attendedAt.slice(0, 10)}</TableCell><TableCell>{r.clinician}</TableCell><TableCell className="tabular-nums" dir="ltr">{r.amount} {r.currency}</TableCell><TableCell>{st(r.status)}</TableCell><TableCell dir="ltr">{r.decision?.feeBasis ?? "-"}</TableCell><TableCell dir="ltr">{r.decision?.sponsoredDiscount ?? "-"}</TableCell><TableCell dir="ltr" className="text-xs">{r.decision?.policyVersion ?? "-"}</TableCell><TableCell>{r.collection ? <button className="underline" onClick={() => { setTab("collections"); setRun(r.collection!.id); }}>{r.collection.periodKey} {r.collection.claimStatus ? t(`kiorexCom.status.${r.collection.claimStatus}`, { defaultValue: r.collection.claimStatus }) : ""}</button> : "-"}</TableCell></TableRow>)}</TableBody></Table>
        ) : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>)}
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
        {tab === "disputes" && (disp.data?.items.length ? <Table><TableHeader><TableRow><TableHead>{t("kiorexCom.col.date")}</TableHead><TableHead>{t("kiorexCom.col.reason")}</TableHead><TableHead>{t("kiorexCom.col.status")}</TableHead><TableHead>{t("kiorexCom.col.amount")}</TableHead><TableHead>{t("kiorexCom.col.resolution")}</TableHead></TableRow></TableHeader><TableBody>{disp.data.items.map((r) => <TableRow key={r.id}><TableCell>{r.createdAt.slice(0, 10)}</TableCell><TableCell>{r.reason}</TableCell><TableCell>{st(r.status)}</TableCell><TableCell dir="ltr">{r.amount} {r.currency}</TableCell><TableCell>{r.resolution ?? "-"}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">{t("kiorexCom.empty")}</p>)}
      </CardContent>
    </Card>
  );
}
