import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEntitlement } from "@/hooks/use-entitlement";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useSchedulingPhysiciansQuery } from "@/lib/api-hooks";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiDelete, apiDownload, apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";

type Breakdown = { key: string; visits: number; collectedNet: number; doctorShare: number };
type Totals = {
  visits: number;
  collectedNet: number;
  doctorShareFromLines: number;
  roomRental: number;
  doctorShare: number;
  clinicShare: number;
  adjustments: number;
  payouts: number;
  netPayable: number;
  unmatchedNet: number;
  byService: Breakdown[];
  byPayer: Breakdown[];
};
type Statement = {
  id: string;
  clinicianId: string;
  clinicianName: string;
  periodKey: string;
  currency: string;
  status: "DRAFT" | "APPROVED" | "PAID";
  totals: Totals;
  adjustments: { amount: number; note: string; at: string }[];
  payouts: { amount: number; method: string; reference: string | null; at: string }[];
};
type StatementsResponse = { periodKey: string; currency: string; canManage: boolean; statements: Statement[] };
type Reconciliation = { revenueNet: number; attributedNet: number; unattributedNet: number; unattributedCount: number; balanced: boolean };
type Rule = {
  id: string;
  clinicianId: string | null;
  appointmentTypeId: string | null;
  revenueCategory: string | null;
  payerKey: string | null;
  ruleType: string;
  percent: number | null;
  fixedAmount: number | null;
  priority: number;
  label: string | null;
};

const RULE_TYPES = ["PERCENT", "FIXED_PER_VISIT", "ROOM_RENTAL"] as const;
const PAYOUT_METHODS = ["TRANSFER", "CASH", "WALLET", "CHEQUE"] as const;

function previousMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** MN-02 — monthly doctor revenue-share statements (own for doctors; all + approve / pay for owners & finance). */
export function DoctorStatementsCard({ manage }: { manage: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const entitled = useEntitlement("mod_revenue");
  const qc = useQueryClient();
  const [period, setPeriod] = useState(previousMonthKey);
  const [adjustFor, setAdjustFor] = useState<Statement | null>(null);
  const [payFor, setPayFor] = useState<Statement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const q = useQuery({
    queryKey: ["revenue-share", "statements", period],
    queryFn: () => apiGet<StatementsResponse>(`/api/v1/revenue-share/statements?period=${encodeURIComponent(period)}`),
    enabled: entitled && /^\d{4}-\d{2}$/.test(period),
    retry: false,
  });
  const canManage = manage && Boolean(q.data?.canManage);
  const rec = useQuery({
    queryKey: ["revenue-share", "reconciliation", period],
    queryFn: () => apiGet<Reconciliation>(`/api/v1/revenue-share/reconciliation?period=${encodeURIComponent(period)}`),
    enabled: entitled && canManage,
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["revenue-share"] });
  const approve = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/revenue-share/statements/${id}/approve`, {}),
    onSuccess: () => {
      toast.success(t("doctorStatements.approved", "Statement approved and locked"));
      void refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });

  if (!entitled || q.isError) return null;
  const rows = q.data?.statements ?? [];
  const money = (n: number, currency = q.data?.currency ?? "") => formatMoneyAmount(n, currency, locale);
  const statusLabel = (s: Statement["status"]) =>
    ({
      DRAFT: t("doctorStatements.status.DRAFT", "Draft"),
      APPROVED: t("doctorStatements.status.APPROVED", "Approved"),
      PAID: t("doctorStatements.status.PAID", "Paid"),
    })[s];

  return (
    <Card data-testid="doctor-statements-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("doctorStatements.title", "Doctor statements")}</CardTitle>
          <CardDescription>
            {canManage
              ? t("doctorStatements.subtitleManage", "Revenue share per doctor from collected payments. Approve to lock a month, then record the payout.")
              : t("doctorStatements.subtitleOwn", "Your share of the payments collected for your visits this month.")}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="statement-period" className="text-xs">
              {t("doctorStatements.period", "Month")}
            </Label>
            <Input
              id="statement-period"
              data-testid="statement-period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-40"
            />
          </div>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)} data-testid="share-rules-open">
              {t("doctorStatements.rules", "Share rules")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && rec.data ? (
          <p className="text-xs text-muted-foreground ltr-nums" data-testid="statement-reconciliation" data-balanced={String(rec.data.balanced)}>
            {t("doctorStatements.reconciliation", "Collected this month {{total}} = doctors {{attributed}} + not linked to a doctor {{unattributed}}", {
              total: money(rec.data.revenueNet),
              attributed: money(rec.data.attributedNet),
              unattributed: money(rec.data.unattributedNet),
            })}
          </p>
        ) : null}
        <ResponsiveTable>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-start">
              <tr>
                <th className="px-3 py-2 text-start">{t("doctorStatements.doctor", "Doctor")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.visits", "Visits")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.collected", "Collected")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.doctorShare", "Doctor share")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.clinicShare", "Clinic share")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.netPayable", "Net payable")}</th>
                <th className="px-3 py-2 text-start">{t("doctorStatements.statusLabel", "Status")}</th>
                <th className="px-3 py-2"><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border" data-testid="statement-row" data-clinician={s.clinicianId} data-status={s.status}>
                  <td className="px-3 py-2 font-medium">
                    {s.clinicianName}
                    {s.totals.roomRental > 0 ? (
                      <span className="block text-xs text-muted-foreground ltr-nums">
                        {t("doctorStatements.roomRental", "Room rental {{amount}}", { amount: money(s.totals.roomRental, s.currency) })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 ltr-nums">{s.totals.visits}</td>
                  <td className="px-3 py-2 ltr-nums">{money(s.totals.collectedNet, s.currency)}</td>
                  <td className="px-3 py-2 ltr-nums" data-testid="statement-doctor-share">
                    {money(s.totals.doctorShare, s.currency)}
                  </td>
                  <td className="px-3 py-2 ltr-nums">{money(s.totals.clinicShare, s.currency)}</td>
                  <td className="px-3 py-2 ltr-nums font-medium">{money(s.totals.netPayable, s.currency)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status === "DRAFT" ? "outline" : "secondary"}>{statusLabel(s.status)}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t("doctorStatements.pdf", "Download PDF")}
                        onClick={() =>
                          void apiDownload(`/api/v1/revenue-share/statements/${s.id}/pdf`, `doctor-statement-${s.periodKey}.pdf`).catch((e) =>
                            toast.error(apiErrorMessage(e, t)),
                          )
                        }
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canManage && s.status === "DRAFT" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setAdjustFor(s)} data-testid="statement-adjust">
                            {t("doctorStatements.adjust", "Adjust")}
                          </Button>
                          <Button size="sm" onClick={() => approve.mutate(s.id)} disabled={approve.isPending} data-testid="statement-approve">
                            {t("doctorStatements.approve", "Approve")}
                          </Button>
                        </>
                      ) : null}
                      {canManage && s.status === "APPROVED" ? (
                        <Button size="sm" onClick={() => setPayFor(s)} data-testid="statement-mark-paid">
                          {t("doctorStatements.markPaid", "Mark paid")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!q.isPending && !rows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    {t("doctorStatements.empty", "No collected revenue for this month.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </CardContent>
      {adjustFor ? <AdjustDialog statement={adjustFor} onClose={() => setAdjustFor(null)} onDone={refresh} /> : null}
      {payFor ? <MarkPaidDialog statement={payFor} onClose={() => setPayFor(null)} onDone={refresh} /> : null}
      {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} onDone={refresh} /> : null}
    </Card>
  );
}

function AdjustDialog({ statement, onClose, onDone }: { statement: Statement; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost(`/api/v1/revenue-share/statements/${statement.id}/adjustments`, { amount: Number(amount), note }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("doctorStatements.adjustTitle", "Adjust statement — {{name}}", { name: statement.clinicianName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="adj-amount">{t("doctorStatements.adjustAmount", "Amount (negative to deduct)")}</Label>
            <Input id="adj-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-note">{t("doctorStatements.adjustNote", "Reason")}</Label>
            <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !amount || Number(amount) === 0 || !note.trim()}>
            {t("doctorStatements.adjustSave", "Add adjustment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ statement, onClose, onDone }: { statement: Statement; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [method, setMethod] = useState<string>("TRANSFER");
  const [reference, setReference] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost(`/api/v1/revenue-share/statements/${statement.id}/mark-paid`, { method, reference: reference.trim() || undefined }),
    onSuccess: () => {
      toast.success(t("doctorStatements.paid", "Payout recorded"));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("doctorStatements.markPaidTitle", "Record payout — {{name}}", { name: statement.clinicianName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm ltr-nums">
            {formatMoneyAmount(statement.totals.netPayable, statement.currency, localeForLanguage(i18n.language))}
          </p>
          <div className="space-y-1">
            <Label htmlFor="pay-method">{t("doctorStatements.payMethod", "Method")}</Label>
            <select id="pay-method" className={nativeSelectClassName} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYOUT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {t(`doctorStatements.methods.${pm}`, pm)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-ref">{t("doctorStatements.payReference", "Reference (optional)")}</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <Button onClick={() => m.mutate()} disabled={m.isPending} data-testid="statement-mark-paid-confirm">
            {t("doctorStatements.markPaid", "Mark paid")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RulesDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["revenue-share", "rules"], queryFn: () => apiGet<Rule[]>("/api/v1/revenue-share/rules"), retry: false });
  const doctors = useSchedulingPhysiciansQuery({});
  const [clinicianId, setClinicianId] = useState("");
  const [ruleType, setRuleType] = useState<string>("PERCENT");
  const [value, setValue] = useState("");
  const nameOf = (id: string | null) =>
    id ? (doctors.data?.find((d) => d.userId === id)?.displayName ?? id) : t("doctorStatements.allDoctors", "All doctors");
  const after = () => {
    void qc.invalidateQueries({ queryKey: ["revenue-share", "rules"] });
    onDone();
  };
  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/revenue-share/rules", {
        clinicianId: clinicianId || null,
        ruleType,
        percent: ruleType === "PERCENT" ? Number(value) : null,
        fixedAmount: ruleType === "PERCENT" ? null : Number(value),
      }),
    onSuccess: () => {
      setValue("");
      after();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/revenue-share/rules/${id}`),
    onSuccess: after,
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  const typeLabel = (rt: string) => t(`doctorStatements.ruleTypes.${rt}`, rt);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("doctorStatements.rules", "Share rules")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t(
            "doctorStatements.rulesHint",
            "The most specific rule wins (doctor, then visit type, category, payer, branch). Changes apply to draft statements only.",
          )}
        </p>
        <ul className="divide-y divide-border text-sm" data-testid="share-rules-list">
          {(rules.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{nameOf(r.clinicianId)}</span> · {typeLabel(r.ruleType)} ·{" "}
                <span className="ltr-nums">{r.ruleType === "PERCENT" ? `${r.percent}%` : r.fixedAmount}</span>
                {r.appointmentTypeId || r.revenueCategory || r.payerKey ? (
                  <span className="text-xs text-muted-foreground"> · {[r.revenueCategory, r.payerKey].filter(Boolean).join(" · ")}</span>
                ) : null}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)} disabled={remove.isPending}>
                {t("doctorStatements.removeRule", "Remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="rule-doctor">{t("doctorStatements.doctor", "Doctor")}</Label>
            <select id="rule-doctor" className={nativeSelectClassName} value={clinicianId} onChange={(e) => setClinicianId(e.target.value)}>
              <option value="">{t("doctorStatements.allDoctors", "All doctors")}</option>
              {(doctors.data ?? []).map((d) => (
                <option key={d.userId} value={d.userId}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-type">{t("doctorStatements.ruleType", "Type")}</Label>
            <select id="rule-type" className={nativeSelectClassName} value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
              {RULE_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {typeLabel(rt)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-value">{ruleType === "PERCENT" ? t("doctorStatements.percent", "Percent") : t("doctorStatements.amount", "Amount")}</Label>
            <Input id="rule-value" type="number" step="0.01" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || value === ""} data-testid="share-rule-add">
            {t("doctorStatements.addRule", "Add rule")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
