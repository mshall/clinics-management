import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import {
  AddressFields,
  addressPayload,
  EmptyBlock,
  emptyAddress,
  ErrorBlock,
  Field,
  fmtDate,
  GateNotice,
  isGateError,
  LoadingBlock,
  PageShell,
  PatientPicker,
  selectClass,
  StatusPill,
  todayIso,
  useClinics,
  useHomeServices,
  useIsAgency,
  useNurseContext,
  useServiceName,
  type AddressDraft,
  type PatientLite,
  type RosterItem,
} from "./nurse-shared";

export type CarePlanView = {
  id: string;
  title: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  patientId: string;
  nurseId: string | null;
  startDate: string;
  visitsTotal: number;
  visitsDone: number;
  visitsRemaining: number;
  endedAt: string | null;
  dischargeNote: string | null;
  visits: { sequence: number; appointmentId: string; startsAt: string | null; status: string | null }[];
  unscheduled?: unknown[];
};

type ItemDraft = { appointmentTypeId: string; everyDays: number; durationDays: number; timeOfDay: string };

const tone = (s: CarePlanView["status"]) => (s === "ACTIVE" ? "ok" : s === "PAUSED" ? "warn" : "muted");

/** KNCP01-03 — care plans: services x frequency x duration generate real home visits; create, list, open. The inbox for Kiorex requests is its own page. */
export function CarePlansPage() {
  const { t } = useTranslation();
  const ctx = useNurseContext();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"" | "ACTIVE" | "PAUSED" | "ENDED">("");
  const plans = useQuery({ queryKey: ["nurse", "care-plans", status], queryFn: () => apiGet<{ items: CarePlanView[] }>(`/api/v1/nurse/care-plans${status ? `?status=${status}` : ""}`) });
  const gateOff = ctx.data ? ctx.data.features["nurse.care_plans"] === false : false;
  return (
    <PageShell
      title={t("nurse.carePlans.title")}
      subtitle={t("nurse.carePlans.subtitle")}
      testId="nurse-care-plans"
      actions={
        <>
          <Button asChild variant="outline" className="min-h-11"><Link to="/nurse/inbox">{t("nurse.inbox.title")}</Link></Button>
          <Button className="min-h-11" disabled={gateOff} onClick={() => setOpen(true)} data-testid="care-plan-new"><Plus className="size-4" aria-hidden /> {t("nurse.carePlans.new")}</Button>
        </>
      }
    >
      {gateOff ? <GateNotice feature="nurse.care_plans" /> : null}
      <div className="flex gap-2" role="group" aria-label={t("nurse.common.status")}>
        {(["", "ACTIVE", "PAUSED", "ENDED"] as const).map((s) => (
          <Button key={s || "all"} size="sm" variant={status === s ? "default" : "outline"} className="min-h-11" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? t(`nurse.carePlans.status.${s}`) : t("nurse.common.all")}
          </Button>
        ))}
      </div>
      {plans.isLoading ? <LoadingBlock /> : null}
      {plans.isError ? <ErrorBlock error={plans.error} onRetry={() => void plans.refetch()} /> : null}
      {plans.data && plans.data.items.length === 0 ? <EmptyBlock message={t("nurse.carePlans.empty")} /> : null}
      <ul className="space-y-3">
        {plans.data?.items.map((p) => (
          <li key={p.id}>
            <Card data-testid="care-plan-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/nurse/care-plans/${p.id}`} className="min-h-11 min-w-0 flex-1 text-base font-semibold leading-snug text-primary underline-offset-4 hover:underline">{p.title}</Link>
                  <StatusPill tone={tone(p.status)}>{t(`nurse.carePlans.status.${p.status}`)}</StatusPill>
                </div>
                <div className="flex items-center gap-3">
                  <span aria-hidden className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="absolute inset-y-0 start-0 rounded-full bg-primary" style={{ width: `${p.visitsTotal ? Math.round((p.visitsDone / p.visitsTotal) * 100) : 0}%` }} /></span>
                  <span className="text-sm font-semibold tabular-nums ltr-nums">{p.visitsDone}/{p.visitsTotal}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("nurse.carePlans.starts", { date: fmtDate(p.startDate) })} · {t("nurse.carePlans.remaining", { count: p.visitsRemaining, total: p.visitsTotal })}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {open ? <CreatePlanDialog onClose={() => setOpen(false)} /> : null}
    </PageShell>
  );
}

function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const agency = useIsAgency();
  const services = useHomeServices();
  const clinics = useClinics();
  const roster = useQuery({ queryKey: ["nurse", "roster"], queryFn: () => apiGet<{ items: RosterItem[] }>("/api/v1/nurse/agency/roster"), enabled: agency });
  const name = useServiceName();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayIso(1));
  const [nurseId, setNurseId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ appointmentTypeId: "", everyDays: 1, durationDays: 7, timeOfDay: "10:00" }]);
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [confirmed, setConfirmed] = useState(false);
  const clinicId = clinics.data?.[0]?.id ?? "";
  const effectiveNurse = agency ? nurseId : me?.id ?? "";
  const valid = Boolean(patient && title.trim() && clinicId && effectiveNurse && items.every((i) => i.appointmentTypeId && i.durationDays >= 1 && i.everyDays >= 1) && address.district.trim() && address.line1.trim() && confirmed);

  const create = useMutation({
    mutationFn: () => apiPost<CarePlanView>("/api/v1/nurse/care-plans", { clinicId, patientId: patient!.id, nurseId: effectiveNurse, title: title.trim(), startDate, items, visitAddress: addressPayload(address), addressConfirmed: confirmed }),
    onSuccess: (plan) => {
      toast.success(t("nurse.carePlans.created", { count: plan.visitsTotal }));
      if (plan.unscheduled?.length) toast.warning(t("nurse.carePlans.unscheduled", { count: plan.unscheduled.length }));
      void qc.invalidateQueries({ queryKey: ["nurse", "care-plans"] });
      onClose();
    },
  });
  const patchItem = (i: number, p: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="care-plan-dialog">
        <DialogHeader><DialogTitle>{t("nurse.carePlans.new")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
          <PatientPicker value={patient} onChange={setPatient} />
          <Field label={t("nurse.carePlans.planTitle")} htmlFor="cp-title"><Input id="cp-title" className="min-h-11" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("nurse.carePlans.startDate")} htmlFor="cp-start"><Input id="cp-start" type="date" className="min-h-11" value={startDate} min={todayIso()} onChange={(e) => setStartDate(e.target.value)} /></Field>
            {agency ? (
              <Field label={t("nurse.common.nurse")} htmlFor="cp-nurse">
                <select id="cp-nurse" className={selectClass} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
                  <option value="">{t("nurse.common.choose")}</option>
                  {roster.data?.items.filter((r) => r.dispatchable).map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
                </select>
              </Field>
            ) : null}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("nurse.carePlans.services")}</p>
            {services.isLoading ? <LoadingBlock /> : null}
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-4" data-testid="care-plan-item">
                <Field label={t("nurse.carePlans.service")} htmlFor={`cp-svc-${i}`}>
                  <select id={`cp-svc-${i}`} className={selectClass} value={it.appointmentTypeId} onChange={(e) => patchItem(i, { appointmentTypeId: e.target.value })}>
                    <option value="">{t("nurse.common.choose")}</option>
                    {services.data?.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                  </select>
                </Field>
                <Field label={t("nurse.carePlans.everyDays")} htmlFor={`cp-every-${i}`}><Input id={`cp-every-${i}`} type="number" min={1} className="min-h-11" value={it.everyDays} onChange={(e) => patchItem(i, { everyDays: Number(e.target.value) })} /></Field>
                <Field label={t("nurse.carePlans.durationDays")} htmlFor={`cp-dur-${i}`}><Input id={`cp-dur-${i}`} type="number" min={1} className="min-h-11" value={it.durationDays} onChange={(e) => patchItem(i, { durationDays: Number(e.target.value) })} /></Field>
                <Field label={t("nurse.carePlans.timeOfDay")} htmlFor={`cp-time-${i}`}><Input id={`cp-time-${i}`} type="time" className="min-h-11" value={it.timeOfDay} onChange={(e) => patchItem(i, { timeOfDay: e.target.value })} /></Field>
                {items.length > 1 ? <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:col-span-4" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden /> {t("nurse.common.remove")}</Button> : null}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setItems((xs) => [...xs, { appointmentTypeId: "", everyDays: 1, durationDays: 7, timeOfDay: "10:00" }])}>{t("nurse.carePlans.addService")}</Button>
          </div>
          <AddressFields value={address} onChange={setAddress} idPrefix="cp-addr" />
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("nurse.carePlans.addressConfirmed")}</label>
          {create.isError ? (isGateError(create.error) ? <GateNotice feature="nurse.care_plans" /> : <ErrorBlock error={create.error} />) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={!valid || create.isPending} data-testid="care-plan-submit">{t("nurse.carePlans.create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
