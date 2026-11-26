import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import "./plan-billing-i18n";

type Row = { subscriptionId: string; tenantId: string; tenantName: string; planKey: string; planName: string; status: string; interval: string; seats: number; autoRenew: boolean | null; autoRenewForced: string | null; currentPeriodEnd: string; downgradedToLiteAt: string | null; downgradeReason: string | null; amount: string | null; currency: string | null };
type Metrics = { windowDays: number; paidSubscriptions: number; autoRenewOff: number; mrr: { currency: string; amount: string }[]; downgradesToLite: number; downgradesByReason: Record<string, number>; reactivations: number; churnLite: number };
type Policy = { autoRenewDefault: boolean; orgMayDisableAutoRenew: boolean; renewalReminderDaysBefore: number[]; lapseAction: string; downgradeAfterDays: number; liteReadOnlyGraceDays: number; proration: { upgradeTiming: string; downgradeTiming: string; creditUnusedOnDowngrade: boolean }; reminderQuietHours: { start: number; end: number } };
type PolicyState = { marketId: string; policy: Policy; pending: { id: string; makerId: string; reason: string; payloadJson: Policy; createdAt: string }[] };
type Market = { id: string; code: string };


/** SUB-01 platform ops: subscriptions list, MRR / churn-lite / downgrade counts, forced actions (audited, reason mandatory) and the maker-checker policy. English only (ops console). */
export function PlatformSubscriptionsTab() {
  const qc = useQueryClient();
  const [planKey, setPlanKey] = useState("");
  const [autoRenew, setAutoRenew] = useState("");
  const [q, setQ] = useState("");
  const [force, setForce] = useState<{ row: Row; kind: "ON" | "OFF" | "DOWNGRADE" | "RELEASE" } | null>(null);
  const [reason, setReason] = useState("");
  const metrics = useQuery({ queryKey: ["platformSubs", "metrics"], queryFn: () => apiGet<Metrics>("/api/v1/admin/platform/subscriptions/metrics?windowDays=30") });
  const list = useQuery({
    queryKey: ["platformSubs", "list", planKey, autoRenew, q],
    queryFn: () => apiGet<{ total: number; items: Row[] }>(`/api/v1/admin/platform/subscriptions?pageSize=50${planKey ? `&planKey=${planKey}` : ""}${autoRenew ? `&autoRenew=${autoRenew}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  const markets = useQuery({ queryKey: ["platformSubs", "markets"], queryFn: () => apiGet<Market[]>("/api/v1/admin/platform/markets") });
  const [marketId, setMarketId] = useState("");
  const mid = marketId || markets.data?.[0]?.id || "";
  const policy = useQuery({ queryKey: ["platformSubs", "policy", mid], enabled: !!mid, queryFn: () => apiGet<PolicyState>(`/api/v1/admin/platform/subscriptions/policy/${mid}`) });
  const [draft, setDraft] = useState<Policy | null>(null);
  const [policyReason, setPolicyReason] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["platformSubs"] });

  const forceMut = useMutation({
    mutationFn: async () => {
      if (!force) return;
      const base = `/api/v1/admin/platform/subscriptions/${force.row.tenantId}`;
      if (force.kind === "DOWNGRADE") return apiPost(`${base}/force-downgrade`, { reason });
      return apiPost(`${base}/force-auto-renew`, { force: force.kind === "RELEASE" ? null : force.kind, reason });
    },
    onSuccess: () => { toast.success("Done"); setForce(null); setReason(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const propose = useMutation({
    mutationFn: () => apiPut(`/api/v1/admin/platform/subscriptions/policy/${mid}/proposals`, { policy: draft, reason: policyReason }),
    onSuccess: () => { toast.success("Proposal created: a second platform admin must approve it"); setDraft(null); setPolicyReason(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decide = useMutation({
    mutationFn: (b: { id: string; approve: boolean }) => apiPost(`/api/v1/admin/platform/subscriptions/policy/proposals/${b.id}/decision`, { approve: b.approve }),
    onSuccess: () => { toast.success("Decision recorded"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = metrics.data;
  const cur = policy.data?.policy;
  const d = draft ?? cur;
  return (
    <div className="space-y-4" data-testid="platform-subscriptions">
      <Card>
        <CardHeader><CardTitle className="text-base">Subscriptions</CardTitle><CardDescription>Recurring subscriptions, auto-renew and downgrades to Lite (last {m?.windowDays ?? 30} days).</CardDescription></CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="subs-metrics">
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">Paid subscriptions</dt><dd className="text-2xl font-semibold">{m?.paidSubscriptions ?? "-"}</dd></div>
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">MRR (monthly equivalent)</dt><dd className="text-lg font-semibold ltr-nums">{m?.mrr.length ? m.mrr.map((x) => `${x.amount} ${x.currency}`).join(" · ") : "-"}</dd></div>
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">Auto-renew off</dt><dd className="text-2xl font-semibold">{m?.autoRenewOff ?? "-"}</dd></div>
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">Moved to Lite</dt><dd className="text-2xl font-semibold">{m?.downgradesToLite ?? "-"}</dd><p className="text-xs text-muted-foreground">{m ? Object.entries(m.downgradesByReason).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}</p></div>
            <div className="rounded-xl border p-3"><dt className="text-xs text-muted-foreground">Churn-lite</dt><dd className="text-2xl font-semibold">{m ? `${(m.churnLite * 100).toFixed(1)}%` : "-"}</dd><p className="text-xs text-muted-foreground">Share of paid subscriptions that moved to Lite. Reactivations: {m?.reactivations ?? 0}</p></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All subscriptions</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div><Label htmlFor="sub-q" className="sr-only">Search organization</Label><Input id="sub-q" placeholder="Search organization" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div><Label htmlFor="sub-plan" className="sr-only">Plan</Label><select id="sub-plan" className={nativeSelectClassName} value={planKey} onChange={(e) => setPlanKey(e.target.value)}><option value="">All plans</option>{["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"].map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><Label htmlFor="sub-ar" className="sr-only">Auto-renew</Label><select id="sub-ar" className={nativeSelectClassName} value={autoRenew} onChange={(e) => setAutoRenew(e.target.value)}><option value="">Auto-renew: any</option><option value="true">On</option><option value="false">Off</option></select></div>
          </div>
        </CardHeader>
        <CardContent>
          <div role="region" aria-label="Subscriptions" tabIndex={0} className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[56rem] text-sm" data-testid="subs-table">
              <thead><tr>{["Organization", "Plan", "Status", "Auto-renew", "Period end", "Moved to Lite", "Actions"].map((h) => <th key={h} scope="col" className="h-10 px-3 text-start font-medium text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {(list.data?.items ?? []).map((r) => (
                  <tr key={r.subscriptionId}>
                    <td className="border-t p-3">{r.tenantName}</td>
                    <td className="border-t p-3">{r.planName}</td>
                    <td className="border-t p-3">{r.status}</td>
                    <td className="border-t p-3">{r.autoRenew == null ? "-" : r.autoRenew ? "On" : "Off"}{r.autoRenewForced ? ` (forced ${r.autoRenewForced})` : ""}</td>
                    <td className="border-t p-3 ltr-nums">{r.currentPeriodEnd.slice(0, 10)}</td>
                    <td className="border-t p-3">{r.downgradedToLiteAt ? `${r.downgradedToLiteAt.slice(0, 10)} (${r.downgradeReason})` : "-"}</td>
                    <td className="border-t p-3">
                      {r.autoRenew != null ? (
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => setForce({ row: r, kind: "ON" })}>Force on</Button>
                          <Button size="sm" variant="outline" onClick={() => setForce({ row: r, kind: "OFF" })}>Force off</Button>
                          {r.autoRenewForced ? <Button size="sm" variant="outline" onClick={() => setForce({ row: r, kind: "RELEASE" })}>Release</Button> : null}
                          <Button size="sm" variant="destructive" onClick={() => setForce({ row: r, kind: "DOWNGRADE" })}>Move to Lite</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="subs-policy">
        <CardHeader>
          <CardTitle className="text-base">Subscription policy (maker-checker)</CardTitle>
          <CardDescription>Changes are proposed by one platform admin and applied only when a different platform admin approves. All values are engineering defaults; proration and grace values are NEEDS_HUMAN (LG-SUB-3).</CardDescription>
          <div className="pt-2"><Label htmlFor="pol-market" className="sr-only">Market</Label><select id="pol-market" className={nativeSelectClassName} value={mid} onChange={(e) => { setMarketId(e.target.value); setDraft(null); }}>{(markets.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></div>
        </CardHeader>
        <CardContent className="space-y-3">
          {d ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.autoRenewDefault} onChange={(e) => setDraft({ ...d, autoRenewDefault: e.target.checked })} />Auto-renew ON by default</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.orgMayDisableAutoRenew} onChange={(e) => setDraft({ ...d, orgMayDisableAutoRenew: e.target.checked })} />Organizations may switch it off</label>
              <div><Label htmlFor="pol-lapse">When dunning ends</Label><select id="pol-lapse" className={nativeSelectClassName} value={d.lapseAction} onChange={(e) => setDraft({ ...d, lapseAction: e.target.value })}><option value="DOWNGRADE_TO_LITE">Move to Lite (never lock out)</option><option value="READ_ONLY_SUSPEND">Read-only, then suspend (legacy)</option></select></div>
              <div><Label htmlFor="pol-days">Move to Lite after N days overdue</Label><Input id="pol-days" type="number" min={1} value={d.downgradeAfterDays} onChange={(e) => setDraft({ ...d, downgradeAfterDays: Number(e.target.value) })} /></div>
              <div><Label htmlFor="pol-grace">Read-only grace after Lite (days)</Label><Input id="pol-grace" type="number" min={0} value={d.liteReadOnlyGraceDays} onChange={(e) => setDraft({ ...d, liteReadOnlyGraceDays: Number(e.target.value) })} /></div>
              <div><Label htmlFor="pol-rem">Reminder days before renewal</Label><Input id="pol-rem" value={d.renewalReminderDaysBefore.join(",")} onChange={(e) => setDraft({ ...d, renewalReminderDaysBefore: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x >= 0) })} /></div>
              <div><Label htmlFor="pol-up">Upgrades apply</Label><select id="pol-up" className={nativeSelectClassName} value={d.proration.upgradeTiming} onChange={(e) => setDraft({ ...d, proration: { ...d.proration, upgradeTiming: e.target.value } })}><option value="IMMEDIATE">Immediately</option><option value="PERIOD_END">At period end</option></select></div>
              <div><Label htmlFor="pol-down">Downgrades apply</Label><select id="pol-down" className={nativeSelectClassName} value={d.proration.downgradeTiming} onChange={(e) => setDraft({ ...d, proration: { ...d.proration, downgradeTiming: e.target.value } })}><option value="PERIOD_END">At period end</option><option value="IMMEDIATE">Immediately</option></select></div>
            </div>
          ) : null}
          {draft ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1"><Label htmlFor="pol-reason">Reason for the change</Label><Input id="pol-reason" value={policyReason} onChange={(e) => setPolicyReason(e.target.value)} /></div>
              <Button disabled={policyReason.trim().length < 3 || propose.isPending} onClick={() => propose.mutate()}>Propose change</Button>
              <Button variant="outline" onClick={() => setDraft(null)}>Discard</Button>
            </div>
          ) : null}
          {(policy.data?.pending ?? []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm" data-testid="policy-pending">
              <span>Pending: {p.reason} (proposed by {p.makerId.slice(0, 8)})</span>
              <span className="flex gap-2"><Button size="sm" onClick={() => decide.mutate({ id: p.id, approve: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: p.id, approve: false })}>Reject</Button></span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!force} onOpenChange={(o) => !o && setForce(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{force?.kind === "DOWNGRADE" ? "Move to Lite" : force?.kind === "RELEASE" ? "Release auto-renew force" : `Force auto-renew ${force?.kind}`}: {force?.row.tenantName}</DialogTitle>
            <DialogDescription>This is audited. A reason is required.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="force-reason">Reason</Label>
          <Input id="force-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setForce(null)}>Cancel</Button><Button disabled={reason.trim().length < 3 || forceMut.isPending} onClick={() => forceMut.mutate()}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default PlatformSubscriptionsTab;
