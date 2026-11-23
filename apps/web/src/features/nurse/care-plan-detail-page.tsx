import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/http";
import type { CarePlanView } from "./care-plans-page";
import { AddressFields, ErrorBlock, Field, GateNotice, LoadingBlock, PageShell, selectClass, StatusPill } from "./nurse-shared";
import { type AddressDraft } from "./nurse-shared-utils";
import { addressPayload, emptyAddress, errorCode, fmtDateTime, isGateError, todayIso, useErrorText } from "./nurse-shared-utils";

type Action = "resume" | "extend" | "end" | null;
const END_REASONS = ["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"] as const;

/** KNCP02/03 — one care plan: remaining counter, generated visits, pause / resume / extend / end with a discharge note, discharge share (consent-gated). */
export function CarePlanDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const [action, setAction] = useState<Action>(null);
  const plan = useQuery({ queryKey: ["nurse", "care-plan", id], queryFn: () => apiGet<CarePlanView>(`/api/v1/nurse/care-plans/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["nurse", "care-plan", id] });
    void qc.invalidateQueries({ queryKey: ["nurse", "care-plans"] });
  };
  const pause = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/care-plans/${id}/pause`, {}),
    onSuccess: () => { toast.success(t("nurse.carePlans.paused")); refresh(); },
    onError: (e) => toast.error(errText(e)),
  });
  const share = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/care-plans/${id}/share-discharge`, {}),
    onSuccess: () => toast.success(t("nurse.carePlans.shared")),
    onError: (e) => toast.error(errorCode(e) === "CONSENT_REQUIRED" ? t("nurse.errors.CONSENT_REQUIRED") : errText(e)),
  });
  const p = plan.data;
  return (
    <PageShell title={p?.title ?? t("nurse.carePlans.title")} subtitle={p ? t("nurse.carePlans.remaining", { count: p.visitsRemaining, total: p.visitsTotal }) : undefined} testId="nurse-care-plan-detail" actions={<Button asChild variant="outline" className="min-h-11"><Link to="/nurse/care-plans">{t("nurse.common.back")}</Link></Button>}>
      {plan.isLoading ? <LoadingBlock /> : null}
      {plan.isError ? <ErrorBlock error={plan.error} onRetry={() => void plan.refetch()} /> : null}
      {p ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={p.status === "ACTIVE" ? "ok" : p.status === "PAUSED" ? "warn" : "muted"}>{t(`nurse.carePlans.status.${p.status}`)}</StatusPill>
            <Button asChild variant="outline" size="sm" className="min-h-11"><Link to={`/nurse/mar/${p.patientId}`}>{t("nurse.carePlans.doctorOrders")}</Link></Button>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="care-plan-actions">
            {p.status === "ACTIVE" ? <Button variant="outline" className="min-h-11" disabled={pause.isPending} onClick={() => pause.mutate()}>{t("nurse.carePlans.pause")}</Button> : null}
            {p.status === "PAUSED" ? <Button variant="outline" className="min-h-11" onClick={() => setAction("resume")}>{t("nurse.carePlans.resume")}</Button> : null}
            {p.status !== "ENDED" ? <Button variant="outline" className="min-h-11" onClick={() => setAction("extend")}>{t("nurse.carePlans.extend")}</Button> : null}
            {p.status !== "ENDED" ? <Button variant="destructive" className="min-h-11" onClick={() => setAction("end")} data-testid="care-plan-end">{t("nurse.carePlans.end")}</Button> : null}
            {p.status === "ENDED" ? <Button variant="outline" className="min-h-11" disabled={share.isPending} onClick={() => share.mutate()}>{t("nurse.carePlans.shareDischarge")}</Button> : null}
          </div>
          {p.status === "ENDED" && p.dischargeNote ? (
            <Card><CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.carePlans.dischargeNote")}</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{p.dischargeNote}</CardContent></Card>
          ) : null}
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.carePlans.visits")}</CardTitle></CardHeader>
            <CardContent>
              <ol className="divide-y text-sm" data-testid="care-plan-visits">
                {p.visits.map((v) => (
                  <li key={v.appointmentId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                    <span>#{v.sequence} · {fmtDateTime(v.startsAt)}</span>
                    <span className="flex items-center gap-2">
                      <StatusPill tone={v.status === "COMPLETED" ? "ok" : v.status === "CANCELLED" ? "muted" : "warn"}>{v.status ?? "-"}</StatusPill>
                      <Link className="text-primary underline" to={`/nurse/visits/${v.appointmentId}`}>{t("nurse.visit.open")}</Link>
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      ) : null}
      {action && p ? <PlanActionDialog id={id} action={action} onClose={() => setAction(null)} onDone={refresh} /> : null}
    </PageShell>
  );
}

function PlanActionDialog({ id, action, onClose, onDone }: { id: string; action: Exclude<Action, null>; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(todayIso(1));
  const [extraDays, setExtraDays] = useState(3);
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [reason, setReason] = useState<(typeof END_REASONS)[number]>("COMPLETED");
  const [note, setNote] = useState("");
  const needsAddress = action === "resume" || action === "extend";
  const valid = action === "end" ? note.trim().length > 0 : Boolean(startDate && address.district.trim() && address.line1.trim() && (action !== "extend" || extraDays >= 1));
  const run = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/nurse/care-plans/${id}/${action}`, action === "end" ? { reason, dischargeNote: note.trim() } : action === "extend" ? { startDate, extraDays, visitAddress: addressPayload(address) } : { startDate, visitAddress: addressPayload(address) }),
    onSuccess: () => { toast.success(t(`nurse.carePlans.done.${action}`)); onDone(); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="care-plan-action-dialog">
        <DialogHeader><DialogTitle>{t(`nurse.carePlans.${action}`)}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) run.mutate(); }}>
          {action === "end" ? (
            <>
              <Field label={t("nurse.carePlans.endReason")} htmlFor="cp-reason">
                <select id="cp-reason" className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  {END_REASONS.map((r) => <option key={r} value={r}>{t(`nurse.carePlans.endReasons.${r}`)}</option>)}
                </select>
              </Field>
              <Field label={t("nurse.carePlans.dischargeNote")} htmlFor="cp-note" hint={t("nurse.carePlans.dischargeHint")}>
                <Textarea id="cp-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("nurse.carePlans.startDate")} htmlFor="cp-act-start"><Input id="cp-act-start" type="date" className="min-h-11" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
              {action === "extend" ? <Field label={t("nurse.carePlans.extraDays")} htmlFor="cp-extra"><Input id="cp-extra" type="number" min={1} max={180} className="min-h-11" value={extraDays} onChange={(e) => setExtraDays(Number(e.target.value))} /></Field> : null}
            </>
          )}
          {needsAddress ? <AddressFields value={address} onChange={setAddress} idPrefix="cp-act" /> : null}
          {run.isError ? (isGateError(run.error) ? <GateNotice feature="nurse.care_plans" /> : <ErrorBlock error={run.error} />) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
            <Button type="submit" className="min-h-11" variant={action === "end" ? "destructive" : "default"} disabled={!valid || run.isPending} data-testid="care-plan-action-submit">{t(`nurse.carePlans.${action}`)}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
