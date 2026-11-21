import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost } from "@/lib/http";
import { EmptyBlock, ErrorBlock, Field, GateNotice, LoadingBlock, PageShell, selectClass, StatusPill } from "./nurse-shared";
import { errorBody, errorCode, fmtDate, fmtDateTime, isGateError, todayIso, useNurseContext } from "./nurse-shared-utils";

type LabItem = { id: string; code: string | null; nameEn: string; nameAr: string };
type Tube = { label: string; specimenType: string; container?: string | null };
type CustodyEvent = { label?: string; type: string; occurredAt: string; by: "NURSE" | "LAB"; temperatureC?: number | null };
type Collection = { collectedAt: string; handedOverAt: string | null; temperatureC: number | null; identifiersChecked: string[]; tubes: Tube[]; labStatus: string | null; labOrderNumber: string | null; rejectionCode: string | null; custody: CustodyEvent[]; result: { reportId: string; secureLink: string | null; releasedAt: string | null } | null };
type LabOrder = { id: string; status: string; patientId: string; orderedAt: string; prescriberName: string | null; prescribedOn: string | null; items: LabItem[]; collection: Collection | null };

/** The refusals worth a dedicated, named block (the server never echoes identifier values, only the kind). */
const LAB_BLOCKS = ["LAB_HANDOFF_NO_CONSENT", "CONSENT_REVOKED", "TWO_IDENTIFIERS_REQUIRED", "IDENTIFIER_MISMATCH", "IDENTIFIER_UNVERIFIABLE", "COLLECTED_IN_FUTURE", "COLLECTED_TIME_INVALID", "HANDOVER_TIME_INVALID", "TEMPERATURE_INVALID", "TUBE_REQUIRED", "TUBE_LABEL_INVALID", "TUBE_LABEL_DUPLICATE", "SPECIMEN_TYPE_REQUIRED", "DOCTOR_ORDER_REQUIRED", "PRESCRIBER_REQUIRED", "ITEM_CODE_REQUIRED", "REJECTED_BY_LAB"] as const;

/** Upgrade state (402 PLAN_UPGRADE_REQUIRED), flag-off (403 FEATURE_DISABLED) or a named safety refusal; anything else is a plain error. */
function LabProblem({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (error instanceof ApiError && error.status === 402) {
    return (
      <div className="kx-callout text-sm" data-tone="info" role="status" data-testid="lab-upgrade">
        <Lock className="mt-0.5 size-5 shrink-0 text-[hsl(var(--info))]" aria-hidden />
        <div><p className="font-medium">{t("nurse.lab.upgradeTitle")}</p><p className="text-muted-foreground">{t("nurse.lab.upgradeHelp")}</p></div>
      </div>
    );
  }
  if (isGateError(error)) return <GateNotice feature="clinic.lab_order_handoff" />;
  const code = errorCode(error);
  if (code && (LAB_BLOCKS as readonly string[]).includes(code)) {
    const kind = errorBody<{ identifierKind?: string }>(error)?.identifierKind;
    return (
      <div className="kx-callout flex-col gap-1 text-sm" data-tone="danger" role="alert" data-testid="lab-block" data-code={code}>
        <p className="text-base font-semibold text-[hsl(var(--danger-text))]">{t("nurse.lab.refused")}: {t(`nurse.lab.block.${code}.title`)}{kind ? ` (${t(`nurse.lab.identifierKinds.${kind}`, kind)})` : ""}</p>
        <p>{t(`nurse.lab.block.${code}.help`)}</p>
        <p className="text-muted-foreground">{t("nurse.lab.nothingSent")}</p>
      </div>
    );
  }
  return <ErrorBlock error={error} />;
}

function useLabFeature() {
  const ctx = useNurseContext();
  return ctx.data ? ctx.data.features["clinic.lab_order_handoff"] === false : false;
}

const labTone = (s: string | null) => (s === "REJECTED_BY_LAB" || s === "CANCELLED" ? "bad" : s === "RELEASED" || s === "VALIDATED" ? "ok" : s ? "warn" : "muted");

/** KNLAB01 / KLORD05 — lab samples: transcribe a doctor's lab request for a visit, then collect and hand over. A nurse never orders on her own authority. */
export function LabOrdersPage() {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const visit = search.get("visit");
  const flagOff = useLabFeature();
  const orders = useQuery({ queryKey: ["nurse", "lab-orders", visit], queryFn: () => apiGet<LabOrder[]>(`/api/v1/nurse/lab-orders${visit ? `?appointmentId=${visit}` : ""}`), retry: false });
  return (
    <PageShell title={t("nurse.lab.title")} subtitle={t("nurse.lab.subtitle")} testId="nurse-lab" actions={visit ? <Button asChild variant="outline" className="min-h-11"><Link to={`/nurse/visits/${visit}`}>{t("nurse.mar.backToVisit")}</Link></Button> : undefined}>
      {flagOff ? <GateNotice feature="clinic.lab_order_handoff" /> : null}
      <div className="kx-callout" data-tone="info"><FlaskConical className="mt-0.5 size-5 shrink-0 text-[hsl(var(--info))]" aria-hidden /><p className="text-sm font-medium">{t("nurse.lab.rule")}</p></div>
      {visit && !flagOff ? <NewLabOrder appointmentId={visit} /> : null}
      {orders.isLoading ? <LoadingBlock /> : null}
      {orders.isError ? <LabProblem error={orders.error} /> : null}
      {orders.data && orders.data.length === 0 ? <EmptyBlock message={t("nurse.lab.empty")} /> : null}
      <ul className="space-y-2">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <Card data-testid="lab-order-card">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <Link className="block min-h-11 text-base font-semibold text-primary underline-offset-4 hover:underline" to={`/nurse/lab/${o.id}${visit ? `?visit=${visit}` : ""}`}>{o.items.map((i) => i.nameEn).join(", ")}</Link>
                  <p className="text-muted-foreground">{t("nurse.lab.requestedBy", { doctor: o.prescriberName ?? "-", date: o.prescribedOn ? fmtDate(o.prescribedOn) : "-" })}</p>
                </div>
                <StatusPill tone={o.collection ? labTone(o.collection.labStatus) : "warn"}>{o.collection ? t(`nurse.lab.status.${o.collection.labStatus ?? "HANDED_OFF"}`, o.collection.labStatus ?? "HANDED_OFF") : t("nurse.lab.notCollected")}</StatusPill>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function NewLabOrder({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [doctor, setDoctor] = useState("");
  const [on, setOn] = useState(todayIso());
  const [tests, setTests] = useState([{ code: "", nameEn: "" }]);
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const valid = Boolean(doctor.trim() && on && confirmed && tests.every((x) => x.code.trim() && x.nameEn.trim()));
  const create = useMutation({
    mutationFn: () => apiPost<LabOrder>(`/api/v1/nurse/visits/${appointmentId}/lab-orders`, { items: tests.map((x) => ({ code: x.code.trim(), nameEn: x.nameEn.trim() })), prescriber: { name: doctor.trim(), orderedOn: on }, confirmedDoctorOrder: confirmed, notes: notes.trim() || undefined }),
    onSuccess: () => { toast.success(t("nurse.lab.created")); setTests([{ code: "", nameEn: "" }]); setConfirmed(false); void qc.invalidateQueries({ queryKey: ["nurse", "lab-orders"] }); },
  });
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.lab.newTitle")}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }} data-testid="lab-new-form">
          <p className="text-sm text-muted-foreground">{t("nurse.lab.newHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("nurse.lab.doctor")} htmlFor="lab-doctor"><Input id="lab-doctor" className="min-h-11" value={doctor} onChange={(e) => setDoctor(e.target.value)} /></Field>
            <Field label={t("nurse.lab.requestDate")} htmlFor="lab-on"><Input id="lab-on" type="date" className="min-h-11" value={on} max={todayIso()} onChange={(e) => setOn(e.target.value)} /></Field>
          </div>
          {tests.map((x, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
              <Field label={t("nurse.lab.testCode")} htmlFor={`lab-code-${i}`} hint={t("nurse.lab.testCodeHint")}><Input id={`lab-code-${i}`} className="min-h-11" value={x.code} onChange={(e) => setTests((ts) => ts.map((y, j) => (j === i ? { ...y, code: e.target.value } : y)))} /></Field>
              <Field label={t("nurse.lab.testName")} htmlFor={`lab-name-${i}`}><Input id={`lab-name-${i}`} className="min-h-11" value={x.nameEn} onChange={(e) => setTests((ts) => ts.map((y, j) => (j === i ? { ...y, nameEn: e.target.value } : y)))} /></Field>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setTests((ts) => [...ts, { code: "", nameEn: "" }])}>{t("nurse.lab.addTest")}</Button>
          <Field label={t("nurse.lab.notes")} htmlFor="lab-notes"><Textarea id="lab-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-2 size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("nurse.lab.confirmDoctor")}</label>
          {create.isError ? <LabProblem error={create.error} /> : null}
          <Button type="submit" size="lg" className="min-h-14 w-full text-base" disabled={!valid || create.isPending} data-testid="lab-create">{t("nurse.lab.create")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const IDENT = ["FULL_NAME", "DATE_OF_BIRTH", "PHONE"] as const;

/** One lab order: the collection form (until handed over) and the chain-of-custody timeline relayed by Kiorex (no PHI, no results). */
export function LabOrderDetailPage() {
  const { orderId = "" } = useParams();
  const [search] = useSearchParams();
  const visit = search.get("visit");
  const { t } = useTranslation();
  const nav = useNavigate();
  const flagOff = useLabFeature();
  const q = useQuery({ queryKey: ["nurse", "lab-order", orderId], queryFn: () => apiGet<LabOrder>(`/api/v1/nurse/lab-orders/${orderId}`), retry: false, refetchInterval: (query) => (query.state.data?.collection && !["RELEASED", "REJECTED_BY_LAB", "CANCELLED"].includes(query.state.data.collection.labStatus ?? "") ? 30_000 : false) });
  const custody = useQuery({ queryKey: ["nurse", "lab-custody", orderId], queryFn: () => apiGet<Collection>(`/api/v1/nurse/lab-orders/${orderId}/custody`), enabled: Boolean(q.data?.collection), retry: false, refetchInterval: 30_000 });
  const o = q.data;
  const c = custody.data ?? o?.collection ?? null;
  return (
    <PageShell title={t("nurse.lab.detailTitle")} subtitle={o ? o.items.map((i) => i.nameEn).join(", ") : undefined} testId="nurse-lab-detail" actions={<Button variant="outline" className="min-h-11" onClick={() => nav(visit ? `/nurse/lab?visit=${visit}` : "/nurse/lab")}>{t("nurse.common.back")}</Button>}>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <LabProblem error={q.error} /> : null}
      {o ? (
        <>
          {flagOff && !o.collection ? <GateNotice feature="clinic.lab_order_handoff" /> : null}
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <p>{t("nurse.lab.requestedBy", { doctor: o.prescriberName ?? "-", date: o.prescribedOn ? fmtDate(o.prescribedOn) : "-" })}</p>
              <ul className="list-disc ps-5">{o.items.map((i) => <li key={i.id}>{i.nameEn} <span className="text-muted-foreground">({i.code})</span></li>)}</ul>
            </CardContent>
          </Card>
          {!o.collection ? <CollectionForm orderId={orderId} appointmentId={visit} disabled={flagOff} /> : null}
          {c ? <CustodyTimeline c={c} /> : null}
        </>
      ) : null}
    </PageShell>
  );
}

function localNow(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CollectionForm({ orderId, appointmentId, disabled }: { orderId: string; appointmentId: string | null; disabled: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<string, string>>({});
  const [collectedAt, setCollectedAt] = useState(localNow());
  const [handedOverAt, setHandedOverAt] = useState("");
  const [temp, setTemp] = useState("");
  const [tubes, setTubes] = useState([{ label: "", specimenType: "BLOOD", container: "" }]);
  const idents = IDENT.filter((k) => (checked[k] ?? "").trim());
  const valid = idents.length >= 2 && tubes.every((x) => x.label.trim() && x.specimenType.trim()) && Boolean(collectedAt);
  const collect = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/nurse/lab-orders/${orderId}/collection`, {
        appointmentId: appointmentId ?? undefined,
        identifiers: idents.map((k) => ({ kind: k, value: checked[k]!.trim() })),
        collectedAt: new Date(collectedAt).toISOString(),
        handedOverAt: handedOverAt ? new Date(handedOverAt).toISOString() : undefined,
        temperatureC: temp ? Number(temp) : undefined,
        tubes: tubes.map((x) => ({ label: x.label.trim(), specimenType: x.specimenType.trim(), ...(x.container.trim() ? { container: x.container.trim() } : {}) })),
      }),
    onSuccess: () => { toast.success(t("nurse.lab.handedOff")); void qc.invalidateQueries({ queryKey: ["nurse", "lab-order", orderId] }); void qc.invalidateQueries({ queryKey: ["nurse", "lab-orders"] }); },
  });
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.lab.collectTitle")}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) collect.mutate(); }} data-testid="lab-collect-form">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("nurse.lab.identifiersTitle")}</legend>
            <p className="text-xs text-muted-foreground">{t("nurse.lab.identifiersHelp")}</p>
            {IDENT.map((k) => (
              <Field key={k} label={t(`nurse.lab.identifierKinds.${k}`)} htmlFor={`lab-id-${k}`}>
                <Input id={`lab-id-${k}`} className="min-h-12 text-base" type={k === "DATE_OF_BIRTH" ? "date" : "text"} value={checked[k] ?? ""} onChange={(e) => setChecked({ ...checked, [k]: e.target.value })} />
              </Field>
            ))}
            {idents.length < 2 ? <p className="text-sm font-medium text-[hsl(var(--warning))]">{t("nurse.lab.needTwo")} <span className="tabular-nums">({idents.length}/2)</span></p> : <p className="text-sm font-medium text-[hsl(var(--success))]">{t("nurse.lab.identifiersTitle")} ({idents.length}/2)</p>}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("nurse.lab.collectedAt")} htmlFor="lab-collected"><Input id="lab-collected" type="datetime-local" className="min-h-11" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} /></Field>
            <Field label={t("nurse.lab.handedOverAt")} htmlFor="lab-handed" hint={t("nurse.lab.handedHint")}><Input id="lab-handed" type="datetime-local" className="min-h-11" value={handedOverAt} onChange={(e) => setHandedOverAt(e.target.value)} /></Field>
            <Field label={t("nurse.lab.temperature")} htmlFor="lab-temp"><Input id="lab-temp" type="number" step="0.1" className="min-h-11" value={temp} onChange={(e) => setTemp(e.target.value)} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("nurse.lab.tubes")}</p>
            {tubes.map((x, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-3" data-testid="lab-tube">
                <Field label={t("nurse.lab.tubeLabel")} htmlFor={`lab-tl-${i}`} hint={t("nurse.lab.tubeLabelHint")}><Input id={`lab-tl-${i}`} className="min-h-11" value={x.label} onChange={(e) => setTubes((ts) => ts.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></Field>
                <Field label={t("nurse.lab.specimenType")} htmlFor={`lab-st-${i}`}>
                  <select id={`lab-st-${i}`} className={selectClass} value={x.specimenType} onChange={(e) => setTubes((ts) => ts.map((y, j) => (j === i ? { ...y, specimenType: e.target.value } : y)))}>
                    {["BLOOD", "URINE", "STOOL", "SWAB", "OTHER"].map((s) => <option key={s} value={s}>{t(`nurse.lab.specimens.${s}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("nurse.lab.container")} htmlFor={`lab-ct-${i}`}><Input id={`lab-ct-${i}`} className="min-h-11" value={x.container} onChange={(e) => setTubes((ts) => ts.map((y, j) => (j === i ? { ...y, container: e.target.value } : y)))} /></Field>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setTubes((ts) => [...ts, { label: "", specimenType: "BLOOD", container: "" }])}>{t("nurse.lab.addTube")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("nurse.lab.consentNote")}</p>
          {collect.isError ? <LabProblem error={collect.error} /> : null}
          <Button type="submit" size="lg" className="min-h-14 w-full text-base" disabled={!valid || disabled || collect.isPending} data-testid="lab-collect-submit">{t("nurse.lab.handOff")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Four-stage progress for a sample so the nurse sees at a glance where it is (collected, handed over, received, result). */
function SampleProgress({ c }: { c: Collection }) {
  const { t } = useTranslation();
  const rejected = c.labStatus === "REJECTED_BY_LAB" || c.labStatus === "CANCELLED";
  const received = c.custody.some((e) => e.type === "RECEIVED" || e.type === "RECEIVED_AT_LAB") || ["ACCEPTED", "COLLECTED", "IN_LAB", "PARTIALLY_RESULTED", "AWAITING_VALIDATION", "VALIDATED", "RELEASED"].includes(c.labStatus ?? "");
  const released = c.labStatus === "RELEASED" || Boolean(c.result?.releasedAt);
  const steps = [
    { id: "collected", label: t("nurse.lab.custody.COLLECTED"), done: true },
    { id: "handed", label: t("nurse.lab.custody.HANDED_OVER"), done: Boolean(c.handedOverAt) || c.custody.some((e) => e.type === "HANDED_OVER") || received },
    { id: "received", label: t("nurse.lab.custody.RECEIVED"), done: received },
    { id: "result", label: t("nurse.lab.status.RELEASED"), done: released },
  ];
  const current = steps.findIndex((x) => !x.done);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={t("nurse.lab.custodyTitle")} data-testid="lab-progress">
      {steps.map((x, i) => (
        <li key={x.id} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-1 text-center">
          <span className="flex w-full items-center">
            <span aria-hidden className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : x.done || i === current ? "bg-primary" : "bg-border"}`} />
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.done ? (rejected && i === steps.length - 1 ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground") : i === current ? (rejected ? "bg-[hsl(var(--danger-text))] text-white" : "bg-accent text-accent-foreground ring-2 ring-primary") : "bg-muted text-muted-foreground"}`}>{x.done ? "\u2713" : i + 1}</span>
            <span aria-hidden className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : steps[i + 1]!.done || i + 1 === current ? "bg-primary" : "bg-border"}`} />
          </span>
          <span className={`text-[0.6875rem] leading-tight ${i === current ? "font-semibold" : "text-muted-foreground"}`}>{x.label}</span>
        </li>
      ))}
    </ol>
  );
}

function CustodyTimeline({ c }: { c: Collection }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="lab-custody">
      <CardHeader className="pb-1"><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span>{t("nurse.lab.custodyTitle")}</span><StatusPill tone={labTone(c.labStatus)}>{t(`nurse.lab.status.${c.labStatus ?? "HANDED_OFF"}`, c.labStatus ?? "HANDED_OFF")}</StatusPill></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SampleProgress c={c} />
        {c.labOrderNumber ? <p>{t("nurse.lab.labNumber", { number: c.labOrderNumber })}</p> : null}
        {c.labStatus === "REJECTED_BY_LAB" ? (
          <div className="kx-callout flex-col gap-1" data-tone="danger" role="alert" data-testid="lab-rejected">
            <p className="text-base font-semibold text-[hsl(var(--danger-text))]">{t("nurse.lab.block.REJECTED_BY_LAB.title")}{c.rejectionCode ? ` (${c.rejectionCode})` : ""}</p>
            <p>{t("nurse.lab.block.REJECTED_BY_LAB.help")}</p>
          </div>
        ) : null}
        <p className="text-muted-foreground">{t("nurse.lab.tubesList", { labels: c.tubes.map((x) => x.label).join(", ") })} · {t("nurse.lab.checkedKinds", { kinds: c.identifiersChecked.map((k) => t(`nurse.lab.contractKinds.${k}`, k)).join(", ") })}</p>
        <ol className="space-y-2 border-s ps-4" data-testid="lab-custody-events">
          {c.custody.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute inset-s-[-1.4rem] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
              <p className="font-medium">{t(`nurse.lab.custody.${e.type}`, e.type)} <span className="text-muted-foreground">· {e.by === "NURSE" ? t("nurse.lab.byNurse") : t("nurse.lab.byLab")}{e.label ? ` · ${e.label}` : ""}</span></p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(e.occurredAt)}{e.temperatureC != null ? ` · ${e.temperatureC} C` : ""}</p>
            </li>
          ))}
        </ol>
        {c.result ? <p className="text-xs text-muted-foreground">{t("nurse.lab.resultReleased")}</p> : null}
      </CardContent>
    </Card>
  );
}
