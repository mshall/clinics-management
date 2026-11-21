import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { EmptyBlock, ErrorBlock, Field, GateNotice, LoadingBlock, PageShell, selectClass, StatusPill, type RosterItem } from "./nurse-shared";
import { fmtDate, fmtDateTime, isGateError, todayIso, useErrorText, useHomeServices, useIsAgency, useNurseContext, useServiceName } from "./nurse-shared-utils";

type PlanRequest = { id: string; requestRef: string; status: "RECEIVED" | "ACCEPTED" | "DECLINED"; clinicianId: string | null; typeId: string | null; preferredStartDate: string | null; notes: string | null; patient: { phone: string; firstNameEn: string; lastNameEn: string }; district: string | null; carePlanId: string | null; declineReason: string | null; createdAt: string };
type HomeVisitRow = { id: string; state: string; plannedStartsAt: string; district: string; source: "KIOREX" | "KIORLY"; patient: { name?: string; id: string }; clinicianId: string | null };

/** Kiorex requests inbox: home bookings that came through Kiorex (REQUESTED / CONFIRMED) and the P3 care-plan requests (accept creates the plan; decline answers DECLINED). */
export function RequestsInboxPage() {
  const { t } = useTranslation();
  const ctx = useNurseContext();
  const gateOff = ctx.data ? ctx.data.features["nurse.care_plans"] === false : false;
  const bookings = useQuery({
    queryKey: ["nurse", "inbox", "bookings"],
    queryFn: () => apiGet<{ items: HomeVisitRow[] }>(`/api/v1/home-visits?from=${todayIso()}`),
    refetchInterval: 30_000,
  });
  const requests = useQuery({ queryKey: ["nurse", "inbox", "plan-requests"], queryFn: () => apiGet<{ items: PlanRequest[] }>("/api/v1/nurse/care-plan-requests"), refetchInterval: 30_000 });
  const kiorex = (bookings.data?.items ?? []).filter((v) => v.source === "KIOREX" && (v.state === "REQUESTED" || v.state === "CONFIRMED"));
  const [accepting, setAccepting] = useState<PlanRequest | null>(null);
  const [declining, setDeclining] = useState<PlanRequest | null>(null);
  return (
    <PageShell title={t("nurse.inbox.title")} subtitle={t("nurse.inbox.subtitle")} testId="nurse-inbox">
      <section className="space-y-3" aria-labelledby="inbox-bookings">
        <h2 id="inbox-bookings" className="text-lg font-semibold">{t("nurse.inbox.bookings")}</h2>
        {bookings.isLoading ? <LoadingBlock /> : null}
        {bookings.isError ? <ErrorBlock error={bookings.error} onRetry={() => void bookings.refetch()} /> : null}
        {bookings.data && kiorex.length === 0 ? <EmptyBlock message={t("nurse.inbox.noBookings")} /> : null}
        <ul className="space-y-2">
          {kiorex.map((v) => (
            <li key={v.id}>
              <Card data-testid="inbox-booking">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <span>{fmtDateTime(v.plannedStartsAt)} · {v.patient.name ?? v.district} · {v.district}</span>
                  <span className="flex items-center gap-2">
                    <StatusPill tone={v.state === "REQUESTED" ? "warn" : "ok"}>{t(`homeVisits.state.${v.state}`)}</StatusPill>
                    {!v.clinicianId || v.state === "REQUESTED" ? <Link className="text-primary underline" to="/nurse/dispatch">{t("nurse.inbox.dispatch")}</Link> : null}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="inbox-plans">
        <h2 id="inbox-plans" className="text-lg font-semibold">{t("nurse.inbox.planRequests")}</h2>
        {gateOff ? <GateNotice feature="nurse.care_plans" /> : null}
        {requests.isLoading ? <LoadingBlock /> : null}
        {requests.isError ? <ErrorBlock error={requests.error} onRetry={() => void requests.refetch()} /> : null}
        {requests.data && requests.data.items.length === 0 ? <EmptyBlock message={t("nurse.inbox.noPlanRequests")} /> : null}
        <ul className="space-y-3">
          {requests.data?.items.map((r) => (
            <li key={r.id}>
              <Card data-testid="plan-request" data-status={r.status}>
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{r.patient.firstNameEn} {r.patient.lastNameEn} · <a className="text-primary underline" href={`tel:${r.patient.phone}`}>{r.patient.phone}</a></p>
                    <StatusPill tone={r.status === "RECEIVED" ? "warn" : r.status === "ACCEPTED" ? "ok" : "muted"}>{t(`nurse.inbox.status.${r.status}`)}</StatusPill>
                  </div>
                  <p className="text-muted-foreground">{t("nurse.inbox.planMeta", { district: r.district ?? "-", date: r.preferredStartDate ? fmtDate(r.preferredStartDate) : "-" })}</p>
                  {r.notes ? <p className="whitespace-pre-wrap">{r.notes}</p> : null}
                  {r.declineReason ? <p className="text-muted-foreground">{r.declineReason}</p> : null}
                  {r.status === "RECEIVED" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button className="min-h-11" onClick={() => setAccepting(r)} data-testid="plan-request-accept">{t("nurse.inbox.accept")}</Button>
                      <Button variant="outline" className="min-h-11" onClick={() => setDeclining(r)}>{t("nurse.inbox.decline")}</Button>
                    </div>
                  ) : null}
                  {r.carePlanId ? <Link className="text-primary underline" to={`/nurse/care-plans/${r.carePlanId}`}>{t("nurse.inbox.openPlan")}</Link> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      {accepting ? <AcceptDialog request={accepting} onClose={() => setAccepting(null)} /> : null}
      {declining ? <DeclineDialog request={declining} onClose={() => setDeclining(null)} /> : null}
    </PageShell>
  );
}

function AcceptDialog({ request, onClose }: { request: PlanRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const agency = useIsAgency();
  const services = useHomeServices();
  const name = useServiceName();
  const roster = useQuery({ queryKey: ["nurse", "roster"], queryFn: () => apiGet<{ items: RosterItem[] }>("/api/v1/nurse/agency/roster"), enabled: agency });
  const [nurseId, setNurseId] = useState(request.clinicianId ?? "");
  const [typeId, setTypeId] = useState(request.typeId ?? "");
  const [every, setEvery] = useState(1);
  const [days, setDays] = useState(7);
  const [time, setTime] = useState("10:00");
  const [start, setStart] = useState(request.preferredStartDate ?? todayIso(1));
  const effectiveNurse = agency ? nurseId : me?.id ?? "";
  const valid = Boolean(effectiveNurse && typeId && start && days >= 1 && every >= 1);
  const accept = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/care-plan-requests/${request.id}/accept`, { nurseId: effectiveNurse, startDate: start, items: [{ appointmentTypeId: typeId, everyDays: every, durationDays: days, timeOfDay: time }] }),
    onSuccess: () => { toast.success(t("nurse.inbox.accepted")); void qc.invalidateQueries({ queryKey: ["nurse"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="plan-request-accept-dialog">
        <DialogHeader><DialogTitle>{t("nurse.inbox.accept")}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) accept.mutate(); }}>
          {agency ? (
            <Field label={t("nurse.common.nurse")} htmlFor="acc-nurse">
              <select id="acc-nurse" className={selectClass} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
                <option value="">{t("nurse.common.choose")}</option>
                {roster.data?.items.filter((r) => r.dispatchable).map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label={t("nurse.carePlans.service")} htmlFor="acc-type">
            <select id="acc-type" className={selectClass} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t("nurse.common.choose")}</option>
              {services.data?.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("nurse.carePlans.everyDays")} htmlFor="acc-every"><Input id="acc-every" type="number" min={1} className="min-h-11" value={every} onChange={(e) => setEvery(Number(e.target.value))} /></Field>
            <Field label={t("nurse.carePlans.durationDays")} htmlFor="acc-days"><Input id="acc-days" type="number" min={1} className="min-h-11" value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
            <Field label={t("nurse.carePlans.timeOfDay")} htmlFor="acc-time"><Input id="acc-time" type="time" className="min-h-11" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label={t("nurse.carePlans.startDate")} htmlFor="acc-start"><Input id="acc-start" type="date" className="min-h-11" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          </div>
          {accept.isError ? (isGateError(accept.error) ? <GateNotice feature="nurse.care_plans" /> : <ErrorBlock error={accept.error} />) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={!valid || accept.isPending} data-testid="plan-request-accept-submit">{t("nurse.inbox.accept")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({ request, onClose }: { request: PlanRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const [reason, setReason] = useState("");
  const decline = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/care-plan-requests/${request.id}/decline`, { reason: reason.trim() || undefined }),
    onSuccess: () => { toast.success(t("nurse.inbox.declined")); void qc.invalidateQueries({ queryKey: ["nurse", "inbox"] }); onClose(); },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("nurse.inbox.decline")}</DialogTitle></DialogHeader>
        <Field label={t("nurse.inbox.declineReason")} htmlFor="dec-reason"><Input id="dec-reason" className="min-h-11" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
          <Button className="min-h-11" disabled={decline.isPending} onClick={() => decline.mutate()}>{t("nurse.inbox.decline")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
