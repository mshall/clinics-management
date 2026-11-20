import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import {
  ErrorBlock,
  errorCode,
  Field,
  fmtDateTime,
  GateNotice,
  isGateError,
  LoadingBlock,
  PageShell,
  selectClass,
  StatusPill,
  useErrorText,
  useNurseContext,
} from "./nurse-shared";

const VITALS = ["systolic", "diastolic", "pulse", "temperatureC", "spo2", "respiratoryRate", "glucoseMgDl", "painScore"] as const;
type VitalKey = (typeof VITALS)[number];
type Flag = "LOW" | "HIGH" | "CRITICAL_LOW" | "CRITICAL_HIGH";
type Vitals = { id: string; recordedAt: string; critical: boolean; escalationAction: string | null; flags: Partial<Record<VitalKey, Flag>> } & Record<VitalKey, number | string | null>;
type ChecklistItem = { task: string; done: boolean; note?: string };
export type VisitRecord = {
  id: string;
  appointmentId: string;
  patientId: string;
  status: "DRAFT" | "SIGNED";
  checklist: ChecklistItem[];
  assessment: string | null;
  intervention: string | null;
  evaluation: string | null;
  freeText: string | null;
  medicationFreeText: string | null;
  signedAt: string | null;
  locked: boolean;
  vitals: Vitals[];
};
type VitalsResult = { id: string; flags: Partial<Record<VitalKey, Flag>>; critical: boolean; escalation: { guidanceEn: string; guidanceAr: string; numbers: { ambulance: string } } | null; thresholdsCmoSigned: boolean };
const ESCALATIONS = ["CALLED_DOCTOR", "CALLED_123", "MONITORING", "OTHER"] as const;
const SUGGESTED_TASKS = ["injection", "dressing", "vitals", "catheter", "education"] as const;

const flagTone = (f: Flag) => (f.startsWith("CRITICAL") ? "bad" : "warn");

/** KNREC01/02 + KNESC01 — visit record (checklist, assessment, intervention, evaluation), vitals with out-of-range flags, critical-value escalation before signing, family update after signing. */
export function VisitRecordPage() {
  const { appointmentId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const ctx = useNurseContext();
  const marOn = ctx.data?.features["nurse.mar"] === true;
  const familyOn = ctx.data?.features["nurse.family_updates"];
  const key = ["nurse", "visit-record", appointmentId];
  const rec = useQuery({ queryKey: key, queryFn: () => apiGet<VisitRecord>(`/api/v1/nurse/visits/${appointmentId}/record`) });
  const patient = useQuery({ queryKey: ["nurse", "patient", rec.data?.patientId], queryFn: () => apiGet<{ firstNameEn: string; lastNameEn: string }>(`/api/v1/patients/${rec.data!.patientId}`), enabled: Boolean(rec.data?.patientId) });

  const [draft, setDraft] = useState<{ checklist: ChecklistItem[]; assessment: string; intervention: string; evaluation: string; freeText: string; medicationFreeText: string } | null>(null);
  const [newTask, setNewTask] = useState("");
  useEffect(() => {
    if (rec.data && !draft && !rec.isFetching) setDraft({ checklist: rec.data.checklist ?? [], assessment: rec.data.assessment ?? "", intervention: rec.data.intervention ?? "", evaluation: rec.data.evaluation ?? "", freeText: rec.data.freeText ?? "", medicationFreeText: rec.data.medicationFreeText ?? "" });
  }, [rec.data, draft, rec.isFetching]);

  // Autosave: field notes must survive leaving the page (e.g. to the MAR) and a dropped connection. Debounced; flushed on leave.
  const savedRef = useRef<string>("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lockedRef = useRef(false);
  useEffect(() => {
    if (rec.data && savedRef.current === "") savedRef.current = JSON.stringify({ checklist: rec.data.checklist ?? [], assessment: rec.data.assessment ?? "", intervention: rec.data.intervention ?? "", evaluation: rec.data.evaluation ?? "", freeText: rec.data.freeText ?? "", medicationFreeText: rec.data.medicationFreeText ?? "" });
  }, [rec.data]);
  useEffect(() => {
    if (!draft || lockedRef.current) return;
    const snap = JSON.stringify(draft);
    if (snap === savedRef.current) return;
    const id = window.setTimeout(() => {
      savedRef.current = snap;
      void apiPut(`/api/v1/nurse/visits/${appointmentId}/record`, draft).catch(() => { savedRef.current = ""; });
    }, 1200);
    return () => window.clearTimeout(id);
  }, [draft, appointmentId]);
  useEffect(() => () => {
    const d = draftRef.current;
    if (d && !lockedRef.current && JSON.stringify(d) !== savedRef.current) {
      qc.setQueryData<VisitRecord>(["nurse", "visit-record", appointmentId], (old) => (old ? { ...old, ...d } : old));
      void apiPut(`/api/v1/nurse/visits/${appointmentId}/record`, d).catch(() => undefined);
    }
  }, [appointmentId, qc]);

  const save = useMutation({
    mutationFn: () => apiPut<VisitRecord>(`/api/v1/nurse/visits/${appointmentId}/record`, draft),
    onSuccess: () => { toast.success(t("nurse.visit.saved")); void qc.invalidateQueries({ queryKey: key }); },
  });
  const sign = useMutation({
    mutationFn: async () => {
      if (draft) await apiPut(`/api/v1/nurse/visits/${appointmentId}/record`, draft);
      return apiPost<VisitRecord>(`/api/v1/nurse/visits/${appointmentId}/record/sign`, {});
    },
    onSuccess: () => { toast.success(t("nurse.visit.signed")); void qc.invalidateQueries({ queryKey: key }); },
  });
  const family = useMutation({
    mutationFn: () => apiPost<{ sent: number; skipped: unknown[] }>(`/api/v1/nurse/visits/${appointmentId}/family-update`, {}),
    onSuccess: (r) => toast.success(t("nurse.visit.familySent", { sent: r.sent, skipped: r.skipped.length })),
  });

  const r = rec.data;
  const locked = Boolean(r?.locked || r?.status === "SIGNED");
  lockedRef.current = locked;
  const openCritical = r?.vitals.filter((v) => v.critical && !v.escalationAction) ?? [];
  const signBlockedByCritical = openCritical.length > 0 || errorCode(sign.error) === "CRITICAL_VALUE_NOT_ESCALATED";
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";

  return (
    <PageShell
      title={t("nurse.visit.title")}
      subtitle={patient.data ? `${patient.data.firstNameEn} ${patient.data.lastNameEn}` : undefined}
      testId="nurse-visit-record"
      actions={<Button asChild variant="outline" className="min-h-11"><Link to="/home-visits/today">{t("nurse.visit.backToToday")}</Link></Button>}
    >
      {rec.isLoading ? <LoadingBlock /> : null}
      {rec.isError ? <ErrorBlock error={rec.error} onRetry={() => void rec.refetch()} /> : null}
      {r && draft ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={locked ? "ok" : "warn"}>{locked ? t("nurse.visit.statusSigned", { at: fmtDateTime(r.signedAt) }) : t("nurse.visit.statusDraft")}</StatusPill>
            <Button asChild variant="outline" size="sm" className="min-h-11"><Link to={`/nurse/mar/${r.patientId}?visit=${appointmentId}`}>{t("nurse.visit.openMar")}</Link></Button>
            <Button asChild variant="outline" size="sm" className="min-h-11"><Link to={`/nurse/lab?visit=${appointmentId}`} data-testid="visit-lab-link">{t("nurse.visit.openLab")}</Link></Button>
          </div>

          {openCritical.length > 0 ? <CriticalBanner vitals={openCritical[0]!} lang={lang} onLogged={() => void qc.invalidateQueries({ queryKey: key })} /> : null}

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.visit.checklist")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-1" data-testid="visit-checklist">
                {draft.checklist.map((c, i) => (
                  <li key={i}>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input type="checkbox" className="size-5" disabled={locked} checked={c.done} onChange={(e) => setDraft({ ...draft, checklist: draft.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} />
                      {c.task}
                    </label>
                  </li>
                ))}
              </ul>
              {!locked ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input className="min-h-11" aria-label={t("nurse.visit.newTask")} placeholder={t("nurse.visit.newTask")} value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                    <Button type="button" variant="outline" className="min-h-11" disabled={!newTask.trim()} onClick={() => { setDraft({ ...draft, checklist: [...draft.checklist, { task: newTask.trim(), done: false }] }); setNewTask(""); }}>{t("nurse.common.add")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_TASKS.map((k) => (
                      <Button key={k} type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setDraft({ ...draft, checklist: [...draft.checklist, { task: t(`nurse.visit.tasks.${k}`), done: false }] })}>+ {t(`nurse.visit.tasks.${k}`)}</Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.visit.notes")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(["assessment", "intervention", "evaluation", "freeText"] as const).map((k) => (
                <Field key={k} label={t(`nurse.visit.${k}`)} htmlFor={`vr-${k}`}>
                  <Textarea id={`vr-${k}`} rows={3} disabled={locked} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                </Field>
              ))}
              {!marOn ? (
                <Field label={t("nurse.visit.medicationFreeText")} htmlFor="vr-med" hint={t("nurse.visit.medicationFreeTextHint")}>
                  <Textarea id="vr-med" rows={2} disabled={locked} value={draft.medicationFreeText} onChange={(e) => setDraft({ ...draft, medicationFreeText: e.target.value })} />
                </Field>
              ) : null}
            </CardContent>
          </Card>

          {!locked ? <VitalsForm patientId={r.patientId} appointmentId={appointmentId} onRecorded={() => void qc.invalidateQueries({ queryKey: key })} /> : null}
          <VitalsHistory vitals={r.vitals} />

          {sign.isError ? <ErrorBlock error={sign.error} /> : null}
          {save.isError ? <ErrorBlock error={save.error} /> : null}
          {!locked ? (
            <div className="sticky bottom-16 z-10 flex flex-wrap justify-end gap-2 rounded-lg border bg-card/95 p-2 backdrop-blur md:bottom-2">
              <Button variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()} data-testid="visit-save">{t("nurse.common.save")}</Button>
              <Button className="min-h-11" disabled={sign.isPending || signBlockedByCritical} onClick={() => sign.mutate()} data-testid="visit-sign">{t("nurse.visit.sign")}</Button>
              {signBlockedByCritical ? <p className="w-full text-end text-xs text-destructive" role="status">{t("nurse.visit.signBlocked")}</p> : null}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.visit.afterSign")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{t("nurse.visit.afterSignHelp")}</p>
                {familyOn === false ? <GateNotice feature="nurse.family_updates" compact /> : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" disabled={family.isPending || familyOn === false} onClick={() => family.mutate()} data-testid="visit-family-update">{t("nurse.visit.sendFamily")}</Button>
                  <Button asChild className="min-h-11"><Link to="/home-visits/today">{t("nurse.visit.backToToday")}</Link></Button>
                </div>
                {family.isError ? (isGateError(family.error) ? <GateNotice feature="nurse.family_updates" compact /> : <p role="alert" className="text-destructive">{errText(family.error)}</p>) : null}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </PageShell>
  );
}

function CriticalBanner({ vitals, lang, onLogged }: { vitals: Vitals; lang: "en" | "ar"; onLogged: () => void }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<(typeof ESCALATIONS)[number]>("CALLED_DOCTOR");
  const [note, setNote] = useState("");
  const log = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/vitals/${vitals.id}/escalation`, { action, note: note.trim() || undefined }),
    onSuccess: () => { toast.success(t("nurse.escalation.logged")); onLogged(); },
  });
  return (
    <div className="space-y-3 rounded-lg border-2 border-destructive bg-destructive/10 p-4" role="alert" data-testid="critical-banner">
      <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-5" aria-hidden /> {t("nurse.escalation.title")}</p>
      <p className="text-sm">{lang === "ar" ? "قيمة حرجة: اتصل بالطبيب الآن. إذا كان المريض غير مستقر اتصل بـ 123 (الإسعاف)." : "Critical value: call the doctor now. If the patient is unstable call 123 (ambulance)."}</p>
      <a href="tel:123" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground"><Phone className="size-4" aria-hidden /> {t("nurse.escalation.call123")}</a>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("nurse.escalation.action")} htmlFor="esc-action">
          <select id="esc-action" className={selectClass} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            {ESCALATIONS.map((a) => <option key={a} value={a}>{t(`nurse.escalation.actions.${a}`)}</option>)}
          </select>
        </Field>
        <Field label={t("nurse.escalation.note")} htmlFor="esc-note"><Input id="esc-note" className="min-h-11" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {log.isError ? <ErrorBlock error={log.error} /> : null}
      <Button className="min-h-11" disabled={log.isPending} onClick={() => log.mutate()} data-testid="escalation-log">{t("nurse.escalation.log")}</Button>
    </div>
  );
}

function VitalsForm({ patientId, appointmentId, onRecorded }: { patientId: string; appointmentId: string; onRecorded: () => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState<Partial<Record<VitalKey, string>>>({});
  const [last, setLast] = useState<VitalsResult | null>(null);
  const body = () => {
    const out: Record<string, number | string> = { appointmentId };
    for (const k of VITALS) if (v[k] !== undefined && v[k] !== "") out[k] = Number(v[k]);
    return out;
  };
  const hasAny = VITALS.some((k) => v[k] !== undefined && v[k] !== "");
  const rec = useMutation({
    mutationFn: () => apiPost<VitalsResult>(`/api/v1/nurse/patients/${patientId}/vitals`, body()),
    onSuccess: (r) => { setLast(r); setV({}); onRecorded(); if (!r.critical) toast.success(t("nurse.vitals.recorded")); },
  });
  const step = (k: VitalKey) => (k === "temperatureC" ? "0.1" : "1");
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.vitals.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (hasAny) rec.mutate(); }} data-testid="vitals-form">
          {VITALS.map((k) => (
            <Field key={k} label={t(`nurse.vitals.keys.${k}`)} htmlFor={`vital-${k}`}>
              <Input id={`vital-${k}`} inputMode="decimal" type="number" step={step(k)} className="min-h-11" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="col-span-2 flex items-end sm:col-span-4">
            <Button type="submit" className="min-h-11" disabled={!hasAny || rec.isPending} data-testid="vitals-submit">{t("nurse.vitals.record")}</Button>
          </div>
        </form>
        {rec.isError ? <ErrorBlock error={rec.error} /> : null}
        {last && Object.keys(last.flags).length ? (
          <p className="text-sm" role="status" data-testid="vitals-flags">
            {Object.entries(last.flags).map(([k, f]) => <StatusPill key={k} tone={flagTone(f as Flag)}>{t(`nurse.vitals.keys.${k}`)}: {t(`nurse.vitals.flags.${f}`)}</StatusPill>)}
          </p>
        ) : null}
        {last && !last.thresholdsCmoSigned ? <p className="text-xs text-muted-foreground">{t("nurse.vitals.placeholderRanges")}</p> : null}
      </CardContent>
    </Card>
  );
}

function VitalsHistory({ vitals }: { vitals: Vitals[] }) {
  const { t } = useTranslation();
  if (!vitals.length) return null;
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.vitals.history")}</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm" data-testid="vitals-history">
          {vitals.map((v) => (
            <li key={v.id} className="space-y-1 py-2">
              <p className="text-xs text-muted-foreground">{fmtDateTime(v.recordedAt)}{v.critical ? ` · ${v.escalationAction ? t(`nurse.escalation.actions.${v.escalationAction}`) : t("nurse.escalation.pending")}` : ""}</p>
              <p className="flex flex-wrap gap-2">
                {VITALS.filter((k) => v[k] != null).map((k) => {
                  const f = v.flags?.[k];
                  return <span key={k} className={f ? (f.startsWith("CRITICAL") ? "font-semibold text-destructive" : "font-medium text-[hsl(var(--warning))] ") : ""}>{t(`nurse.vitals.keys.${k}`)} {String(v[k])}{f ? ` (${t(`nurse.vitals.flags.${f}`)})` : ""}</span>;
                })}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

