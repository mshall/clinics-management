import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/http";
import { allergyLabel, type PatientAllergyCode } from "@/lib/patient-allergies";
import {
  EmptyBlock,
  ErrorBlock,
  errorBody,
  errorCode,
  Field,
  fmtDate,
  fmtDateTime,
  GateNotice,
  isGateError,
  LoadingBlock,
  PageShell,
  PatientPicker,
  selectClass,
  StatusPill,
  todayIso,
  useNurseContext,
  type PatientLite,
} from "./nurse-shared";

type OrderLine = { medicineName: string; dose?: string; route?: string; frequency?: string; minIntervalMinutes?: number };
type Order = { id: string; patientId: string; source: "PHOTO_UPLOAD" | "SHARED_KIORLY"; prescriberName: string; orderedOn: string; expiresOn: string; controlled: boolean; lines: OrderLine[]; status: "ACTIVE" | "REVOKED" };
type Administration = { id: string; medicineName: string; dose: string; route: string; administeredAt: string; doctorOrderId: string; nurseId: string };
type Allergy = { id?: string; code: PatientAllergyCode; otherComment?: string | null };

const MAR_BLOCK_CODES = ["DOCTOR_ORDER_REQUIRED", "ORDER_PATIENT_MISMATCH", "ORDER_REVOKED", "ORDER_EXPIRED", "MEDICINE_NOT_IN_ORDER", "ALLERGY_CONFLICT", "DUPLICATE_ADMINISTRATION", "CONTROLLED_REQUIRES_CONTROLLED_ORDER", "CONTROLLED_REQUIRES_WITNESS"] as const;

/** MAR entry route: choose a patient, then open their MAR. */
export function MarIndexPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [p, setP] = useState<PatientLite | null>(null);
  return (
    <PageShell title={t("nurse.mar.title")} subtitle={t("nurse.mar.subtitle")} testId="nurse-mar-index">
      <PatientPicker value={p} onChange={(x) => { setP(x); if (x) nav(`/nurse/mar/${x.id}`); }} />
    </PageShell>
  );
}

const isExpired = (o: Order) => o.expiresOn < todayIso();

/** KNMAR01-03 — doctor orders and the medication administration record. No order, no administration (BR57); allergy / duplicate / expiry / controlled-witness blocks are shown as blocks, never as warnings. */
export function MarPage() {
  const { patientId = "" } = useParams();
  const [search] = useSearchParams();
  const visitAppointmentId = search.get("visit");
  const { t } = useTranslation();
  const qc = useQueryClient();
  const ctx = useNurseContext();
  const gateOff = ctx.data ? ctx.data.features["nurse.mar"] === false : false;
  const [photoOpen, setPhotoOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ order: Order; line: OrderLine } | null>(null);

  const patient = useQuery({ queryKey: ["nurse", "patient", patientId], queryFn: () => apiGet<{ firstNameEn: string; lastNameEn: string }>(`/api/v1/patients/${patientId}`) });
  const allergies = useQuery({ queryKey: ["nurse", "allergies", patientId], queryFn: async () => { const d = await apiGet<Allergy[] | { items: Allergy[] }>(`/api/v1/patients/${patientId}/allergies?pageSize=5`); return Array.isArray(d) ? d : d.items; } });
  const orders = useQuery({ queryKey: ["nurse", "mar-orders", patientId], queryFn: () => apiGet<{ items: Order[] }>(`/api/v1/nurse/mar/patients/${patientId}/orders`), enabled: !gateOff });
  const admins = useQuery({ queryKey: ["nurse", "mar-admins", patientId], queryFn: () => apiGet<{ items: Administration[] }>(`/api/v1/nurse/mar/patients/${patientId}/administrations`), enabled: !gateOff });
  const revoke = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/nurse/mar/orders/${id}/revoke`, {}),
    onSuccess: () => { toast.success(t("nurse.mar.revoked")); void qc.invalidateQueries({ queryKey: ["nurse", "mar-orders", patientId] }); },
  });
  const active = (orders.data?.items ?? []).filter((o) => o.status === "ACTIVE" && !isExpired(o));
  const name = patient.data ? `${patient.data.firstNameEn} ${patient.data.lastNameEn}` : undefined;

  return (
    <PageShell
      title={t("nurse.mar.title")}
      subtitle={name}
      testId="nurse-mar"
      actions={
        <>
          {visitAppointmentId ? <Button asChild variant="outline" className="min-h-11"><Link to={`/nurse/visits/${visitAppointmentId}`}>{t("nurse.mar.backToVisit")}</Link></Button> : null}
          <Button variant="outline" className="min-h-11" disabled={gateOff} onClick={() => setPhotoOpen(true)} data-testid="mar-add-order">{t("nurse.mar.addOrder")}</Button>
        </>
      }
    >
      {gateOff ? (
        <>
          <GateNotice feature="nurse.mar" />
          <p className="text-sm text-muted-foreground">{t("nurse.mar.gateOffHelp")}</p>
        </>
      ) : (
        <>
          <div className="kx-callout" data-tone="info" data-testid="mar-rule"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-[hsl(var(--info))]" aria-hidden /><p className="text-sm font-medium">{t("nurse.mar.rule")}</p></div>
          <section className="kx-callout" data-tone={allergies.isError || (allergies.data && allergies.data.length > 0) ? "danger" : allergies.data ? "good" : "info"} data-testid="mar-allergies" aria-label={t("nurse.mar.allergies")}>
            <ShieldAlert className={`mt-0.5 size-5 shrink-0 ${allergies.isError || (allergies.data && allergies.data.length > 0) ? "text-[hsl(var(--danger-text))]" : "text-[hsl(var(--success))]"}`} aria-hidden />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <h2 className="text-base font-semibold">{t("nurse.mar.allergies")}</h2>
              {allergies.isLoading ? <LoadingBlock /> : null}
              {allergies.isError ? (
                <div role="alert" data-testid="mar-allergies-error" className="space-y-1">
                  <ErrorBlock error={allergies.error} onRetry={() => void allergies.refetch()} />
                  <p className="font-medium text-[hsl(var(--danger-text))]">{t("nurse.mar.allergiesUnknown")}</p>
                </div>
              ) : null}
              {allergies.data && allergies.data.length === 0 ? <p className="text-muted-foreground">{t("nurse.mar.noAllergies")}</p> : null}
              <div className="flex flex-wrap gap-2">{allergies.data?.map((a, i) => <StatusPill key={a.id ?? i} tone="bad">{allergyLabel(a.code, (k, d) => t(k, d))}{a.otherComment ? ` (${a.otherComment})` : ""}</StatusPill>)}</div>
            </div>
          </section>

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.mar.orders")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {orders.isLoading ? <LoadingBlock /> : null}
              {orders.isError ? <ErrorBlock error={orders.error} onRetry={() => void orders.refetch()} /> : null}
              {orders.data && orders.data.items.length === 0 ? <EmptyBlock message={t("nurse.mar.noOrders")} /> : null}
              {orders.data && orders.data.items.length > 0 && active.length === 0 ? <div className="kx-callout" data-tone="danger" role="alert" data-testid="mar-no-active-order"><Ban className="size-5 shrink-0 text-[hsl(var(--danger-text))]" aria-hidden /><p className="text-sm font-medium">{t("nurse.mar.noActiveOrder")}</p></div> : null}
              <ul className="space-y-3">
                {orders.data?.items.map((o) => {
                  const usable = o.status === "ACTIVE" && !isExpired(o);
                  return (
                    <li key={o.id} className={`rounded-xl border p-3 text-sm ${usable ? "border-border bg-card" : "border-dashed bg-muted/40 opacity-80"}`} data-testid="mar-order">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{o.prescriberName} · {fmtDate(o.orderedOn)}</p>
                        <span className="flex flex-wrap gap-1">
                          <StatusPill tone={usable ? "ok" : "bad"}>{o.status === "REVOKED" ? t("nurse.mar.orderStatus.REVOKED") : isExpired(o) ? t("nurse.mar.orderStatus.EXPIRED") : t("nurse.mar.orderStatus.ACTIVE")}</StatusPill>
                          {o.controlled ? <StatusPill tone="warn">{t("nurse.mar.controlled")}</StatusPill> : null}
                          <StatusPill tone="muted">{t(`nurse.mar.source.${o.source}`)}</StatusPill>
                        </span>
                      </div>
                      <p className="text-muted-foreground">{t("nurse.mar.expires", { date: fmtDate(o.expiresOn) })}</p>
                      <ul className="mt-2 space-y-1">
                        {o.lines.map((l, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                            <span className="min-w-0"><span className="block truncate text-base font-semibold">{l.medicineName}</span><span className="block text-muted-foreground">{[l.dose, l.route, l.frequency].filter(Boolean).join(" · ")}</span></span>
                            {usable ? <Button size="lg" className="min-h-12 shrink-0" onClick={() => setPrefill({ order: o, line: l })} data-testid="mar-administer-line">{t("nurse.mar.administer")}</Button> : null}
                          </li>
                        ))}
                      </ul>
                      {o.status === "ACTIVE" ? <Button size="sm" variant="ghost" className="mt-1 min-h-11 text-destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(o.id)}>{t("nurse.mar.revoke")}</Button> : null}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <AdministerForm patientId={patientId} visitAppointmentId={visitAppointmentId} orders={active} prefill={prefill} />

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.mar.given")}</CardTitle></CardHeader>
            <CardContent>
              {admins.isLoading ? <LoadingBlock /> : null}
              {admins.data && admins.data.items.length === 0 ? <EmptyBlock message={t("nurse.mar.noneGiven")} /> : null}
              <ul className="divide-y text-sm" data-testid="mar-given">
                {admins.data?.items.map((a) => <li key={a.id} className="flex items-start gap-3 py-3"><span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[hsl(var(--success))]" /><span><strong className="text-base">{a.medicineName}</strong> <span className="text-muted-foreground">{[a.dose, a.route].filter(Boolean).join(" · ")}</span><span className="block text-xs text-muted-foreground tabular-nums">{fmtDateTime(a.administeredAt)}</span></span></li>)}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
      {photoOpen ? <PhotoOrderDialog patientId={patientId} onClose={() => setPhotoOpen(false)} /> : null}
    </PageShell>
  );
}

function AdministerForm({ patientId, visitAppointmentId, orders, prefill }: { patientId: string; visitAppointmentId: string | null; orders: Order[]; prefill: { order: Order; line: OrderLine } | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [orderId, setOrderId] = useState("");
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("");
  const [witness, setWitness] = useState("");
  const [lastPrefill, setLastPrefill] = useState<typeof prefill>(null);
  if (prefill && prefill !== lastPrefill) {
    setLastPrefill(prefill);
    setOrderId(prefill.order.id);
    setMedicine(prefill.line.medicineName);
    setDose(prefill.line.dose ?? "");
    setRoute(prefill.line.route ?? "");
  }
  const order = orders.find((o) => o.id === orderId);
  const give = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/mar/administrations`, { patientId, doctorOrderId: orderId, visitAppointmentId: visitAppointmentId ?? undefined, medicineName: medicine.trim(), dose: dose.trim(), route: route.trim(), witnessName: witness.trim() || undefined }),
    onSuccess: () => { toast.success(t("nurse.mar.recorded")); setWitness(""); void qc.invalidateQueries({ queryKey: ["nurse", "mar-admins", patientId] }); },
  });
  const valid = Boolean(orderId && medicine.trim() && dose.trim() && route.trim() && (!order?.controlled || witness.trim()));
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.mar.recordTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="mar-need-order">{t("nurse.mar.needOrder")}</p> : null}
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) give.mutate(); }} data-testid="mar-form">
          <Field label={t("nurse.mar.order")} htmlFor="mar-order">
            <select id="mar-order" className={selectClass} value={orderId} disabled={orders.length === 0} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">{t("nurse.common.choose")}</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.prescriberName} · {fmtDate(o.orderedOn)}</option>)}
            </select>
          </Field>
          <Field label={t("nurse.mar.medicine")} htmlFor="mar-medicine"><Input id="mar-medicine" list="mar-lines" className="min-h-11" value={medicine} onChange={(e) => setMedicine(e.target.value)} /></Field>
          <datalist id="mar-lines">{order?.lines.map((l, i) => <option key={i} value={l.medicineName} />)}</datalist>
          <Field label={t("nurse.mar.dose")} htmlFor="mar-dose"><Input id="mar-dose" className="min-h-11" value={dose} onChange={(e) => setDose(e.target.value)} /></Field>
          <Field label={t("nurse.mar.route")} htmlFor="mar-route"><Input id="mar-route" className="min-h-11" value={route} onChange={(e) => setRoute(e.target.value)} /></Field>
          {order?.controlled ? (
            <Field label={t("nurse.mar.witness")} htmlFor="mar-witness" hint={t("nurse.mar.witnessHint")}><Input id="mar-witness" className="min-h-11" value={witness} onChange={(e) => setWitness(e.target.value)} /></Field>
          ) : null}
          <div className="sm:col-span-2"><Button type="submit" size="lg" className="min-h-14 w-full text-base" disabled={!valid || give.isPending} data-testid="mar-submit">{t("nurse.mar.record")}</Button></div>
        </form>
        {give.isError ? <MarBlock error={give.error} /> : null}
      </CardContent>
    </Card>
  );
}

/** A refused administration: always a block with the reason and what to do; nothing was recorded. */
function MarBlock({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  const code = errorCode(error);
  if (isGateError(error)) return <GateNotice feature="nurse.mar" />;
  if (code && (MAR_BLOCK_CODES as readonly string[]).includes(code)) {
    return (
      <div className="kx-callout flex-col gap-1 text-sm" data-tone="danger" role="alert" data-testid="mar-block" data-code={code}>
        <p className="flex items-center gap-2 text-base font-semibold text-[hsl(var(--danger-text))]"><Ban className="size-5 shrink-0" aria-hidden /> {t("nurse.mar.blocked")}: {t(`nurse.mar.block.${code}.title`)}</p>
        <p>{t(`nurse.mar.block.${code}.help`)}</p>
        <p className="text-muted-foreground">{t("nurse.mar.nothingRecorded")}</p>
        {i18n.exists(`nurse.mar.block.${code}.title`) ? null : <p>{String(errorBody<{ message?: string }>(error)?.message ?? "")}</p>}
      </div>
    );
  }
  return <ErrorBlock error={error} />;
}

function PhotoOrderDialog({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prescriber, setPrescriber] = useState("");
  const [orderedOn, setOrderedOn] = useState(todayIso());
  const [expiresOn, setExpiresOn] = useState(todayIso(30));
  const [controlled, setControlled] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>([{ medicineName: "", dose: "", route: "", frequency: "" }]);
  const patch = (i: number, p: Partial<OrderLine>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valid = Boolean(prescriber.trim() && orderedOn && expiresOn && confirmed && lines.every((l) => l.medicineName.trim()));
  const create = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/mar/orders/photo`, { patientId, prescriberName: prescriber.trim(), orderedOn, expiresOn, controlled, lines: lines.map((l) => ({ ...l, medicineName: l.medicineName.trim() })) }),
    onSuccess: () => { toast.success(t("nurse.mar.orderSaved")); void qc.invalidateQueries({ queryKey: ["nurse", "mar-orders", patientId] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="mar-order-dialog">
        <DialogHeader><DialogTitle>{t("nurse.mar.addOrder")}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
          <p className="text-sm text-muted-foreground">{t("nurse.mar.photoHelp")}</p>
          <Field label={t("nurse.mar.prescriber")} htmlFor="ord-prescriber"><Input id="ord-prescriber" className="min-h-11" value={prescriber} onChange={(e) => setPrescriber(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("nurse.mar.orderedOn")} htmlFor="ord-on"><Input id="ord-on" type="date" className="min-h-11" value={orderedOn} onChange={(e) => setOrderedOn(e.target.value)} /></Field>
            <Field label={t("nurse.mar.expiresOnLabel")} htmlFor="ord-exp"><Input id="ord-exp" type="date" className="min-h-11" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></Field>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2" data-testid="ord-line">
              <Field label={t("nurse.mar.medicine")} htmlFor={`ord-med-${i}`}><Input id={`ord-med-${i}`} className="min-h-11" value={l.medicineName} onChange={(e) => patch(i, { medicineName: e.target.value })} /></Field>
              <Field label={t("nurse.mar.dose")} htmlFor={`ord-dose-${i}`}><Input id={`ord-dose-${i}`} className="min-h-11" value={l.dose ?? ""} onChange={(e) => patch(i, { dose: e.target.value })} /></Field>
              <Field label={t("nurse.mar.route")} htmlFor={`ord-route-${i}`}><Input id={`ord-route-${i}`} className="min-h-11" value={l.route ?? ""} onChange={(e) => patch(i, { route: e.target.value })} /></Field>
              <Field label={t("nurse.mar.minInterval")} htmlFor={`ord-int-${i}`}><Input id={`ord-int-${i}`} type="number" min={1} className="min-h-11" value={l.minIntervalMinutes ?? ""} onChange={(e) => patch(i, { minIntervalMinutes: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setLines((xs) => [...xs, { medicineName: "" }])}>{t("nurse.mar.addLine")}</Button>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={controlled} onChange={(e) => setControlled(e.target.checked)} /> {t("nurse.mar.controlledOrder")}</label>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-2 size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("nurse.mar.confirmOrder")}</label>
          {create.isError ? <ErrorBlock error={create.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
            <Button type="submit" size="lg" className="min-h-12" disabled={!valid || create.isPending} data-testid="mar-order-submit">{t("nurse.common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
