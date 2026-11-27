import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error-message";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { type MatchItem, type MatchStatus, useConfirmMatch, useInvoiceSearch, useMatchAudit, useMatchQueue, useMatchSummary, useRejectMatch, useUploadIpn } from "./pay-api";
import { stateTone } from "./pay-logic";
import { Pill, TD, TH, Tbl } from "./pay-ui";

const FILTERS: MatchStatus[] = ["OPEN", "APPLIED", "CONFIRMED", "REJECTED"];

/** Pay invoice matching: unmatched payments, suggested matches with confidence, manual match, audit. The server decides what may auto-apply (contract safety floors); this screen never loosens them. */
export function PayMatchingPanel() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [filter, setFilter] = useState<MatchStatus>("OPEN");
  const [manual, setManual] = useState<MatchItem | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const summary = useMatchSummary();
  const queue = useMatchQueue(filter);
  const upload = useUploadIpn();
  const confirm = useConfirmMatch();
  const reject = useRejectMatch();
  const money = (v: number, c: string) => formatMoneyAmount(v, c, locale);
  const conf = (n: number) => t("pay.m.confidence", { value: n.toFixed(2) });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const content = await f.text();
    upload.mutate({ content, format: f.name.toLowerCase().endsWith(".json") ? "json" : "csv", filename: f.name }, { onSuccess: (r) => setNotice(t("pay.m.uploadResult", { received: r.received, applied: r.applied, queued: r.queued, duplicates: r.duplicates })) });
    if (file.current) file.current.value = "";
  };

  if (summary.isError && queue.isError) return <p role="alert" className="text-sm text-muted-foreground" data-testid="pay-finance-only">{t("pay.financeOnly")}</p>;
  const s = summary.data;
  return (
    <div className="space-y-4" data-testid="pay-matching">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pay.tabs.matching")}</CardTitle>
          {s ? <CardDescription data-testid="pay-match-summary">{t("pay.m.summary", { open: s.byStatus.OPEN ?? 0, applied: s.byStatus.APPLIED ?? 0, confirmed: s.byStatus.CONFIRMED ?? 0 })}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {s ? <p className="rounded-lg bg-muted/60 p-3 text-xs" data-testid="pay-floors">{t("pay.m.floors", { auto: s.config.autoThreshold, margin: s.config.autoMargin })}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" id="pay-ipn-file" aria-label={t("pay.m.upload")} data-testid="pay-ipn-file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button type="button" size="sm" className="min-h-11" disabled={upload.isPending} onClick={() => file.current?.click()} data-testid="pay-upload">{t("pay.m.upload")}</Button>
            <span className="text-xs text-muted-foreground">{t("pay.m.uploadHint")}</span>
          </div>
          {upload.isError ? <p role="alert" className="text-sm text-destructive">{apiErrorMessage(upload.error, t)}</p> : null}
          {notice ? <p role="status" className="text-sm" data-testid="pay-upload-result">{notice}</p> : null}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("pay.tabs.matching")}>
            {FILTERS.map((f) => (
              <Button key={f} role="tab" aria-selected={filter === f} size="sm" className="min-h-11" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} data-testid={`pay-filter-${f}`}>
                {t(`pay.m.filter.${f}`)}{s ? ` (${s.byStatus[f] ?? 0})` : ""}
              </Button>
            ))}
          </div>
          {queue.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("pay.loading")}</p> : null}
          {queue.isError ? <p role="alert" className="text-sm text-destructive">{t("pay.loadError")}</p> : null}
          {queue.data && queue.data.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="pay-queue-empty">{t("pay.m.empty")}</p> : null}
          {queue.data && queue.data.length > 0 ? (
            <Tbl label={t("pay.tabs.matching")} testid="pay-queue">
              <thead><tr><TH>{t("pay.m.colBank")}</TH><TH>{t("pay.m.colAmount")}</TH><TH>{t("pay.m.colReference")}</TH><TH>{t("pay.m.colDecision")}</TH><TH>{t("pay.m.colSuggested")}</TH><TH>{t("pay.m.colActions")}</TH></tr></thead>
              <tbody>
                {queue.data.map((m) => {
                  const reversal = m.eventKind !== "payment.captured";
                  return (
                    <tr key={m.id} data-testid={`pay-row-${m.bankRef}`} data-decision={m.decision} data-status={m.status}>
                      <TD><span className="ltr-nums font-medium">{m.bankRef}</span><span className="block text-xs text-muted-foreground">{new Date(m.paidAt).toLocaleDateString(locale)}</span></TD>
                      <TD className="ltr-nums font-medium">{money(m.amount, m.currency)}</TD>
                      <TD className="ltr-nums">{m.reference || <span className="text-muted-foreground">{t("pay.m.noReference")}</span>}</TD>
                      <TD>
                        <Pill tone={stateTone(m.status === "OPEN" ? m.decision : m.status)}>{m.status === "OPEN" ? t(`pay.m.decision.${m.decision}`) : t(`pay.l.state.${m.status}`)}</Pill>
                        <span className="mt-1 block text-xs text-muted-foreground ltr-nums">{conf(m.confidence)}</span>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{m.reasons.map((r) => <li key={r}>{t(`pay.m.reasons.${r}`, { defaultValue: r })}</li>)}</ul>
                      </TD>
                      <TD>
                        {m.targetInvoice && m.status !== "OPEN" ? <span className="ltr-nums">{m.targetInvoice.invoiceNumber}</span> : null}
                        {m.status === "OPEN" && m.candidateInvoices.length === 0 ? <span className="text-xs text-muted-foreground">{reversal ? t("pay.m.reversal") : t("pay.m.noSuggestion")}</span> : null}
                        {m.status === "OPEN" ? (
                          <ul className="space-y-1">
                            {m.candidateInvoices.filter((c) => c.invoice).map((c) => (
                              <li key={c.targetId} className="flex flex-wrap items-center gap-2">
                                <span className="ltr-nums">{c.invoice!.invoiceNumber}</span>
                                <span className="text-xs text-muted-foreground ltr-nums">{conf(c.confidence)}</span>
                                {!reversal ? <Button size="sm" variant="outline" className="min-h-11" disabled={confirm.isPending} onClick={() => confirm.mutate({ id: m.id, invoiceId: c.targetId })} data-testid={`pay-confirm-${m.bankRef}`}>{t("pay.m.confirmWith", { number: c.invoice!.invoiceNumber })}</Button> : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-2">
                          {m.status === "OPEN" && !reversal ? <Button size="sm" variant="outline" className="min-h-11" onClick={() => setManual(m)} data-testid={`pay-manual-${m.bankRef}`}>{t("pay.m.manual")}</Button> : null}
                          {m.status === "OPEN" ? <Button size="sm" variant="ghost" className="min-h-11" disabled={reject.isPending} onClick={() => reject.mutate({ id: m.id })} data-testid={`pay-reject-${m.bankRef}`}>{t("pay.m.reject")}</Button> : null}
                          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setAuditId(m.id)} data-testid={`pay-audit-${m.bankRef}`}>{t("pay.m.audit")}</Button>
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Tbl>
          ) : null}
          {confirm.isError ? <p role="alert" className="text-sm text-destructive" data-testid="pay-confirm-error">{apiErrorMessage(confirm.error, t)}</p> : null}
        </CardContent>
      </Card>
      {manual ? <ManualDialog item={manual} onClose={() => setManual(null)} /> : null}
      {auditId ? <AuditDialog id={auditId} onClose={() => setAuditId(null)} /> : null}
    </div>
  );
}

function ManualDialog({ item, onClose }: { item: MatchItem; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const found = useInvoiceSearch(q, true);
  const confirm = useConfirmMatch();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="pay-manual-dialog">
        <DialogHeader><DialogTitle>{t("pay.m.manualTitle")}: {formatMoneyAmount(item.amount, item.currency, locale)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor="pay-manual-q">{t("pay.m.manualSearch")}</label>
          <Input id="pay-manual-q" value={q} onChange={(e) => setQ(e.target.value)} data-testid="pay-manual-q" />
          {found.data && found.data.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.m.manualNone")}</p> : null}
          <ul className="max-h-60 space-y-1 overflow-auto" role="radiogroup" aria-label={t("pay.m.manualTitle")}>
            {(found.data ?? []).filter((i) => i.currency === item.currency).map((i) => (
              <li key={i.id}>
                <Button type="button" role="radio" aria-checked={picked === i.id} variant={picked === i.id ? "default" : "outline"} className="min-h-11 w-full justify-between gap-2" onClick={() => setPicked(i.id)} data-testid={`pay-pick-${i.invoiceNumber}`}>
                  <span className="ltr-nums">{i.invoiceNumber}</span><span className="truncate">{i.patientName}</span><span className="text-xs ltr-nums">{t("pay.m.manualOwes", { amount: formatMoneyAmount(i.outstanding, i.currency, locale) })}</span>
                </Button>
              </li>
            ))}
          </ul>
          {confirm.isError ? <p role="alert" className="text-sm text-destructive" data-testid="pay-manual-error">{apiErrorMessage(confirm.error, t)}</p> : null}
          <Button className="min-h-11 w-full" disabled={!picked || confirm.isPending} onClick={() => confirm.mutate({ id: item.id, invoiceId: picked! }, { onSuccess: onClose })} data-testid="pay-manual-confirm">{t("pay.m.manualConfirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const q = useMatchAudit(id);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="pay-audit-dialog">
        <DialogHeader><DialogTitle>{t("pay.m.auditTitle")}</DialogTitle></DialogHeader>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("pay.loading")}</p> : null}
        {q.isError ? <p role="alert" className="text-sm text-destructive">{t("pay.loadError")}</p> : null}
        <ol className="space-y-2 text-sm" data-testid="pay-audit-events">
          {(q.data?.events ?? []).map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded-lg border p-2" data-action={e.action}>
              <span className="font-medium">{t(`pay.m.actions.${e.action}`, { defaultValue: e.action })}</span>
              {e.actor ? <span className="ms-2 text-muted-foreground">{t("pay.m.by", { name: e.actor })}</span> : null}
              <span className="block text-xs text-muted-foreground ltr-nums">{new Date(e.at).toLocaleString(locale)}</span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
