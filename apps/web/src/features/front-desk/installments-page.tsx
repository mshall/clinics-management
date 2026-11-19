import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { useClinicsQuery } from "@/lib/api-hooks";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import { formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { canUsePatientMoney } from "@/lib/patient-money-policy";
import { useAuthStore } from "@/stores/auth-store";
import { SplitPaymentDialog } from "./split-payment-dialog";

type InstallmentRow = {
  id: string;
  operationId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientNameAr: string | null;
  hasPhone: boolean;
  dueOn: string;
  amount: number;
  currency: string;
  operationBalance: number;
  paidAt: string | null;
  paymentId: string | null;
  reminderSentAt: string | null;
  status: "PAID" | "OVERDUE" | "DUE_SOON" | "UPCOMING";
};

type ScheduleLine = { dueOn: string; amount: string };

/** MN-06 — installment schedule + WhatsApp reminders; pay with the split dialog. */
export function InstallmentsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const user = useAuthStore((s) => s.user);
  const entitled = useEntitlement("mod_invoices");
  const allowed = entitled && canUsePatientMoney(user);
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  const activeClinic = clinicId || clinics[0]?.id || "";
  const [status, setStatus] = useState<"OPEN" | "OVERDUE" | "DUE_SOON" | "">("OPEN");
  const [payRow, setPayRow] = useState<InstallmentRow | null>(null);
  const [scheduleOp, setScheduleOp] = useState<{ operationId: string; balance: number; currency: string } | null>(null);
  const [lines, setLines] = useState<ScheduleLine[]>([{ dueOn: "", amount: "" }]);

  const list = useQuery({
    queryKey: ["installments", activeClinic, status],
    queryFn: () => {
      const q = new URLSearchParams();
      if (activeClinic) q.set("clinicId", activeClinic);
      if (status) q.set("status", status);
      return apiGet<InstallmentRow[]>(`/api/v1/billing/installments?${q}`);
    },
    enabled: allowed && Boolean(activeClinic),
    retry: false,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["installments"] });
  const money = (n: number, currency: string) => formatMoneyAmount(n, currency, locale);
  const patientLabel = (r: InstallmentRow) =>
    i18n.language.startsWith("ar") && r.patientNameAr ? r.patientNameAr : r.patientName;

  const remind = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/installment-reminders/${id}`, {}),
    onSuccess: () => {
      toast.success(t("installments.reminderSent", "Reminder queued"));
      void refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });

  const saveSchedule = useMutation({
    mutationFn: () => {
      if (!scheduleOp) throw new Error("no op");
      const rows = lines
        .map((l) => ({ dueOn: l.dueOn, amount: Number(l.amount) }))
        .filter((l) => l.dueOn && Number.isFinite(l.amount) && l.amount > 0);
      return apiPut(`/api/v1/billing/operations/${scheduleOp.operationId}/installments`, { rows });
    },
    onSuccess: () => {
      toast.success(t("installments.scheduleSaved", "Schedule saved"));
      setScheduleOp(null);
      void refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });

  const statusVariant = useMemo(
    () =>
      ({
        PAID: "secondary" as const,
        OVERDUE: "muted" as const,
        DUE_SOON: "default" as const,
        UPCOMING: "outline" as const,
      }) satisfies Record<InstallmentRow["status"], "secondary" | "muted" | "default" | "outline">,
    [],
  );

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">{t("installments.notAllowed", "Your role cannot manage installments.")}</p>;
  }

  return (
    <div className="space-y-6" data-testid="installments-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("installments.title", "Installments")}</h1>
          <p className="text-muted-foreground">
            {t("installments.subtitle", "Operation payment schedules, reminders, and split collections.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={nativeSelectClassName}
            value={activeClinic}
            onChange={(e) => setClinicId(e.target.value)}
            aria-label={t("installments.clinic", "Clinic")}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {formatClinicNameFields(c.nameEn, c.nameAr, i18n.language, c.id)}
              </option>
            ))}
          </select>
          <select
            className={nativeSelectClassName}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            aria-label={t("installments.filter", "Filter")}
            data-testid="installments-filter"
          >
            <option value="OPEN">{t("installments.filterOpen", "Open")}</option>
            <option value="OVERDUE">{t("installments.filterOverdue", "Overdue")}</option>
            <option value="DUE_SOON">{t("installments.filterDueSoon", "Due soon")}</option>
            <option value="">{t("installments.filterAll", "All")}</option>
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("installments.schedule", "Schedule")}</CardTitle>
          <CardDescription>{t("installments.scheduleHint", "Unpaid rows for this clinic. Pay with a split receipt or send a WhatsApp reminder.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <thead>
              <tr>
                <th>{t("installments.patient", "Patient")}</th>
                <th>{t("installments.dueOn", "Due")}</th>
                <th>{t("installments.amount", "Amount")}</th>
                <th>{t("installments.status", "Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((r) => (
                <tr key={r.id} data-testid={`installment-row-${r.id}`}>
                  <td>{patientLabel(r)}</td>
                  <td className="ltr-nums">{r.dueOn}</td>
                  <td className="ltr-nums">{money(r.amount, r.currency)}</td>
                  <td>
                    <Badge variant={statusVariant[r.status]}>{t(`installments.statuses.${r.status}`, r.status)}</Badge>
                  </td>
                  <td className="space-x-2 space-x-reverse text-end">
                    {!r.paidAt ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!r.hasPhone || remind.isPending}
                          onClick={() => remind.mutate(r.id)}
                          data-testid={`remind-${r.id}`}
                        >
                          <Bell className="me-1 h-3.5 w-3.5" />
                          {t("installments.remind", "Remind")}
                        </Button>
                        <Button type="button" size="sm" onClick={() => setPayRow(r)} data-testid={`pay-${r.id}`}>
                          {t("installments.pay", "Collect")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setScheduleOp({ operationId: r.operationId, balance: r.operationBalance, currency: r.currency });
                            setLines([{ dueOn: r.dueOn, amount: String(r.amount) }]);
                          }}
                          data-testid={`edit-schedule-${r.operationId}`}
                        >
                          {t("installments.editSchedule", "Edit schedule")}
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("installments.paid", "Paid")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!list.isPending && !(list.data ?? []).length ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground">
                    {t("installments.empty", "No installments match this filter.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </ResponsiveTable>
        </CardContent>
      </Card>

      {payRow ? (
        <SplitPaymentDialog
          open
          onOpenChange={(v) => !v && setPayRow(null)}
          clinicId={payRow.clinicId}
          patientId={payRow.patientId}
          balance={payRow.operationBalance}
          currency={payRow.currency}
          target={{ kind: "OPERATION", operationId: payRow.operationId }}
          invalidateKeys={[["installments"]]}
          onPaid={() => setPayRow(null)}
        />
      ) : null}

      <Dialog open={Boolean(scheduleOp)} onOpenChange={(v) => !v && setScheduleOp(null)}>
        <DialogContent data-testid="installment-schedule-dialog">
          <DialogHeader>
            <DialogTitle>{t("installments.editSchedule", "Edit schedule")}</DialogTitle>
          </DialogHeader>
          {scheduleOp ? (
            <div className="space-y-3 text-sm">
              <p className="ltr-nums text-muted-foreground">
                {t("installments.opBalance", "Operation balance")}: {money(scheduleOp.balance, scheduleOp.currency)}
              </p>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <div className="space-y-1">
                    <Label>{t("installments.dueOn", "Due")}</Label>
                    <Input type="date" value={l.dueOn} onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, dueOn: e.target.value } : x)))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("installments.amount", "Amount")}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="ltr-nums"
                      value={l.amount}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" disabled={lines.length <= 1} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { dueOn: "", amount: "" }])}>
                <Plus className="me-1 h-4 w-4" />
                {t("installments.addRow", "Add installment")}
              </Button>
              <Button type="button" className="w-full" disabled={saveSchedule.isPending} onClick={() => saveSchedule.mutate()} data-testid="save-schedule">
                {t("installments.saveSchedule", "Save schedule")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
