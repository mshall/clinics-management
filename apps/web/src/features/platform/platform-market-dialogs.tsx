import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";
import { fill, marketStrings } from "./platform-markets-strings";
import { type ReadinessLike, type TransitionKind, messageForError, toTransitionBody, transitionPath, validateTransition } from "./platform-markets-logic";

export type MarketBrief = { id: string; code: string; nameEn: string; requireSecondApprover?: boolean; readiness?: ReadinessLike & { taxPack: { ok: boolean; invoiceVatPercent?: number; saasVatPercent?: number; defaultVisitFee?: number; trnRequired?: boolean; trnFormat?: string | null }; commercialConfigured?: boolean } };

const BASE = "/api/v1/admin/platform/markets";

function useS() {
  const { i18n } = useTranslation();
  return marketStrings(i18n.resolvedLanguage ?? i18n.language);
}

/** Go live, Pause, Disable and Enable: a reason is required, approval reference and link are recorded, errors are shown in the dialog. */
export function MarketActionDialog({ market, kind, onClose, onDone }: { market: MarketBrief; kind: TransitionKind; onClose: () => void; onDone: (note?: string) => void }) {
  const s = useS();
  const a = s.action[kind];
  const [reason, setReason] = useState("");
  const [approvalRef, setApprovalRef] = useState("");
  const [approvalLink, setApprovalLink] = useState("");
  const [days, setDays] = useState("7");
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiPost<{ pending?: boolean; unchanged?: boolean }>(`${BASE}/${encodeURIComponent(market.id)}/${transitionPath(kind)}`, toTransitionBody(kind, { reason, approvalRef, approvalLink, days })),
    onSuccess: (r) => onDone(r?.pending ? s.action.pendingSent : r?.unchanged ? s.action.unchanged : undefined),
    onError: (e) => setErr(messageForError(e, s.errors, "", s.errors.generic)),
  });
  const submit = () => {
    if (mut.isPending) return; // double-click guard
    const code = validateTransition(kind, { reason, approvalRef, approvalLink, days });
    if (code) return setErr((s.errors as unknown as Record<string, string>)[code] ?? s.errors.generic);
    setErr(null);
    mut.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !mut.isPending ? onClose() : undefined)}>
      <DialogContent className="max-w-lg" data-testid={`market-action-${kind.toLowerCase()}`}>
        <DialogHeader>
          <DialogTitle>
            {a.title}: {market.code} {market.nameEn}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{a.intro}</p>
        {market.requireSecondApprover ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{s.action.second}</p> : null}
        <div className="grid gap-3">
          <div>
            <Label htmlFor="mk-reason">{s.action.reason}</Label>
            <Textarea id="mk-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mk-appref">{s.action.approvalRef}</Label>
              <Input id="mk-appref" value={approvalRef} maxLength={128} onChange={(e) => setApprovalRef(e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label htmlFor="mk-applink">{s.action.approvalLink}</Label>
              <Input id="mk-applink" value={approvalLink} maxLength={500} onChange={(e) => setApprovalLink(e.target.value)} dir="ltr" placeholder="https://" />
            </div>
          </div>
          {kind === "PAUSE" ? (
            <div>
              <Label htmlFor="mk-days">{s.action.days}</Label>
              <Input id="mk-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" className="max-w-32" />
            </div>
          ) : null}
          {err ? (
            <p role="alert" className="text-sm text-destructive" data-testid="market-action-error">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>
              {s.action.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={mut.isPending} data-testid="market-action-confirm">
              {mut.isPending ? s.action.working : a.confirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AuditRow = { id: string; action: string; fromStatus: string | null; toStatus: string | null; fromOperational: string | null; toOperational: string | null; actorId: string; actorEmail: string | null; actorSource: string; reason: string; approvalRef: string | null; approvalLink: string | null; secondApproverId: string | null; createdAt: string };

export function MarketHistoryDialog({ market, onClose }: { market: MarketBrief; onClose: () => void }) {
  const s = useS();
  const [before, setBefore] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const q = useQuery({
    queryKey: ["platform", "markets", market.id, "audit", before],
    queryFn: async () => {
      const r = await apiGet<{ items: AuditRow[]; nextBefore: string | null }>(`${BASE}/${encodeURIComponent(market.id)}/audit?limit=25${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      setRows((prev) => (before ? [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))] : r.items));
      return r;
    },
  });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl" data-testid="market-history">
        <DialogHeader>
          <DialogTitle>
            {s.history.title}: {market.code} {market.nameEn}
          </DialogTitle>
        </DialogHeader>
        {q.isPending ? <p className="text-sm text-muted-foreground">...</p> : null}
        {q.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {s.errors.generic}
          </p>
        ) : null}
        {!q.isPending && rows.length === 0 ? <p className="text-sm text-muted-foreground">{s.history.empty}</p> : null}
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-border p-3 text-sm" data-testid="market-history-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {r.action}
                  {r.toStatus && r.fromStatus !== r.toStatus ? ` (${r.fromStatus ?? ""} ${s.history.to} ${r.toStatus})` : ""}
                  {r.toOperational && r.fromOperational !== r.toOperational ? ` (${r.fromOperational ?? ""} ${s.history.to} ${r.toOperational})` : ""}
                </span>
                <time className="text-xs text-muted-foreground" dir="ltr">
                  {new Date(r.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-muted-foreground" dir="auto">
                {r.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                {r.actorEmail ?? r.actorId} · {r.actorSource}
                {r.approvalRef ? ` · ${s.history.approval}: ${r.approvalRef}` : ""}
                {r.secondApproverId ? ` · ${s.history.secondApprover}: ${r.secondApproverId}` : ""}
              </p>
              {r.approvalLink ? (
                <a className="text-xs underline" href={r.approvalLink} target="_blank" rel="noopener noreferrer" dir="ltr">
                  {r.approvalLink}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        {q.data?.nextBefore ? (
          <Button type="button" variant="outline" onClick={() => setBefore(q.data!.nextBefore)}>
            {s.history.more}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type PendingRequest = { id: string; action: string; reason: string; requestedBy: string; requestedEmail: string | null; createdAt: string };

export function MarketPrerequisitesDialog({ market, onClose, onChanged, canChange = true }: { market: MarketBrief; onClose: () => void; onChanged: () => void; canChange?: boolean }) {
  const s = useS();
  const p = s.prereqDialog;
  const qc = useQueryClient();
  const r = market.readiness;
  const [vat, setVat] = useState(String(r?.taxPack.invoiceVatPercent ?? ""));
  const [saas, setSaas] = useState(String(r?.taxPack.saasVatPercent ?? ""));
  const [fee, setFee] = useState(String(r?.taxPack.defaultVisitFee ?? ""));
  const [trnRequired, setTrnRequired] = useState(Boolean(r?.taxPack.trnRequired));
  const [trnFormat, setTrnFormat] = useState(r?.taxPack.trnFormat ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (e: unknown) => setMsg({ ok: false, text: messageForError(e, s.errors, "", s.errors.generic) });
  const requests = useQuery({ queryKey: ["platform", "markets", market.id, "requests"], queryFn: () => apiGet<PendingRequest[]>(`${BASE}/${encodeURIComponent(market.id)}/change-requests?status=PENDING`) });
  const reasonOk = reason.trim().length >= 3;
  const taxMut = useMutation({
    mutationFn: () => apiPut(`${BASE}/${encodeURIComponent(market.id)}/tax-pack`, { invoiceVatPercent: Number(vat), saasVatPercent: Number(saas), defaultVisitFee: Number(fee), trnRequired, trnFormat: trnFormat.trim() || null, reason: reason.trim() }),
    onSuccess: () => { setMsg({ ok: true, text: p.saved }); onChanged(); },
    onError: fail,
  });
  const secondMut = useMutation({
    mutationFn: (on: boolean) => apiPatch(`${BASE}/${encodeURIComponent(market.id)}/second-approver`, { requireSecondApprover: on, reason: reason.trim() }),
    onSuccess: () => { setMsg({ ok: true, text: p.saved }); onChanged(); },
    onError: fail,
  });
  const decide = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: "approve" | "reject" }) => apiPost(`${BASE}/${encodeURIComponent(market.id)}/change-requests/${encodeURIComponent(id)}/${verb}`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["platform", "markets"] }); onChanged(); },
    onError: fail,
  });
  const numOk = [vat, saas, fee].every((x) => x.trim() !== "" && Number.isFinite(Number(x)) && Number(x) >= 0);
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl" data-testid="market-prereq">
        <DialogHeader>
          <DialogTitle>
            {p.title}: {market.code} {market.nameEn}
          </DialogTitle>
        </DialogHeader>
        <section>
          <h3 className="text-sm font-semibold">{p.blockers}</h3>
          {r && r.blockers.length ? (
            <ul className="mt-1 list-disc ps-5 text-sm">
              {r.blockers.map((b) => (
                <li key={b.code}>{(s.errors as unknown as Record<string, string>)[b.code] ?? b.message}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{p.none}</p>
          )}
          <p className="mt-2 text-sm">
            {p.commercial}: <Badge variant="secondary">{r?.commercialConfigured ? p.commercialSet : p.commercialUnset}</Badge>
          </p>
        </section>
        {canChange ? (
          <>
            <div>
              <Label htmlFor="mk-pre-reason">{s.action.reason}</Label>
              <Textarea id="mk-pre-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
            </div>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{p.tax}</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="mk-vat">{p.invoiceVat}</Label><Input id="mk-vat" inputMode="decimal" dir="ltr" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
                <div><Label htmlFor="mk-saas">{p.saasVat}</Label><Input id="mk-saas" inputMode="decimal" dir="ltr" value={saas} onChange={(e) => setSaas(e.target.value)} /></div>
                <div><Label htmlFor="mk-fee">{p.visitFee}</Label><Input id="mk-fee" inputMode="decimal" dir="ltr" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trnRequired} onChange={(e) => setTrnRequired(e.target.checked)} />{p.trnRequired}</label>
              <div><Label htmlFor="mk-trn">{p.trnFormat}</Label><Input id="mk-trn" dir="ltr" value={trnFormat} onChange={(e) => setTrnFormat(e.target.value)} /></div>
              <Button type="button" disabled={!numOk || !reasonOk || taxMut.isPending} onClick={() => { setMsg(null); taxMut.mutate(); }} data-testid="market-save-tax">{p.saveTax}</Button>
            </section>
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">{p.second}</h3>
              <p className="text-sm text-muted-foreground">{market.requireSecondApprover ? p.secondOn : p.secondOff}</p>
              <Button type="button" variant="outline" className="w-fit" disabled={!reasonOk || secondMut.isPending} onClick={() => { setMsg(null); secondMut.mutate(!market.requireSecondApprover); }}>
                {market.requireSecondApprover ? p.turnOff : p.turnOn}
              </Button>
            </section>
          </>
        ) : null}
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{p.pending}</h3>
          {(requests.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{p.noPending}</p> : null}
          {(requests.data ?? []).map((q) => (
            <div key={q.id} className="rounded-md border border-border p-2 text-sm">
              <div className="font-medium">{q.action}</div>
              <p className="text-muted-foreground" dir="auto">{q.reason}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{q.requestedEmail ?? q.requestedBy}</p>
              {canChange ? (
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: q.id, verb: "approve" })}>{p.approve}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: q.id, verb: "reject" })}>{p.reject}</Button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
        {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-[hsl(var(--success))]" : "text-sm text-destructive"}>{fill(msg.text, {})}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
