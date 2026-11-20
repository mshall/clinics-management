import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, ShieldCheck, Siren, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import { currentPosition, EmptyBlock, ErrorBlock, Field, fmtDateTime, LoadingBlock, PageShell, selectClass, StatusPill, useErrorText } from "./nurse-shared";

type RouteVisit = { id: string; state: string; plannedStartsAt: string; plannedEndsAt: string; district: string; patient: { name?: string } };
type Alert = { id: string; visitId: string; kind: "NO_ANSWER" | "SOS" | "UNSAFE_ABORT"; raisedAt: string; status: string; withinSla: boolean };
type SosResult = { show: { ambulance: string; police: string }; delivered: boolean };
const PROMPT_AFTER_END_MIN = 30;
const ALERT_AFTER_PROMPT_MIN = 10;
const ABORT_CATEGORIES = ["THREAT_OR_VIOLENCE", "UNSAFE_ENVIRONMENT", "PATIENT_IMPAIRED_OR_AGGRESSIVE", "OTHER"] as const;

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** HVSAF01-04 — safety hub: the check-in timer, "I'm safe", one-tap SOS (123 / 122), the unsafe-abort flow (never a no-show) and the safety contact. None of this is behind a feature flag (ADR-025). */
export function SafetyPage() {
  const { t } = useTranslation();
  return (
    <PageShell title={t("nurse.safety.title")} subtitle={t("nurse.safety.subtitle")} testId="nurse-safety">
      <EmergencyCard />
      <ActiveVisitSafety />
      <SafetyContactCard />
      <AlertsCard />
    </PageShell>
  );
}

function EmergencyCard() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("nurse.safety.emergency")} className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold"><Siren className="size-5 text-[hsl(var(--danger-text))]" aria-hidden />{t("nurse.safety.emergency")}</p>
      <div className="grid grid-cols-2 gap-3">
        <a href="tel:123" className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-destructive px-3 py-2 text-destructive-foreground shadow-kx-2 active:translate-y-px"><span className="flex items-center gap-2 text-2xl font-bold tabular-nums"><Phone className="size-5" aria-hidden />123</span><span className="text-sm opacity-95">{t("nurse.safety.ambulance")}</span></a>
        <a href="tel:122" className="flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 border-[hsl(var(--danger-text))] bg-card px-3 py-2 text-[hsl(var(--danger-text))] shadow-kx-1 active:translate-y-px"><span className="flex items-center gap-2 text-2xl font-bold tabular-nums"><Phone className="size-5" aria-hidden />122</span><span className="text-sm">{t("nurse.safety.police")}</span></a>
      </div>
    </section>
  );
}

function ActiveVisitSafety() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const now = useNow();
  const route = useQuery({ queryKey: ["home-visits", "route"], queryFn: () => apiGet<{ items: RouteVisit[] }>("/api/v1/home-visits/route"), refetchInterval: 30_000 });
  const active = route.data?.items.find((v) => v.state === "ARRIVED") ?? route.data?.items.find((v) => v.state === "ON_MY_WAY");
  const [sos, setSos] = useState<SosResult | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [category, setCategory] = useState<(typeof ABORT_CATEGORIES)[number]>("UNSAFE_ENVIRONMENT");
  const [reason, setReason] = useState("");
  const [aborted, setAborted] = useState(false);
  const done = () => void qc.invalidateQueries({ queryKey: ["home-visits"] });
  const answer = useMutation({ mutationFn: () => apiPost(`/api/v1/home-visits/${active!.id}/safety/answer`, {}), onSuccess: () => { toast.success(t("nurse.safety.answered")); done(); }, onError: (e) => toast.error(errText(e)) });
  const sosM = useMutation({
    mutationFn: async () => { const geo = await currentPosition(); return apiPost<SosResult>(`/api/v1/home-visits/${active!.id}/sos`, geo); },
    onSuccess: (r) => { setSos(r); done(); },
    onError: (e) => toast.error(e instanceof Error && !("status" in e) ? t("homeVisits.needLocation") : errText(e)),
  });
  const abort = useMutation({
    mutationFn: async () => { const geo = await currentPosition().catch(() => null); return apiPost(`/api/v1/home-visits/${active!.id}/abort-unsafe`, { reason: reason.trim(), reasonCategory: category, ...(geo ?? {}) }); },
    onSuccess: () => { setAborted(true); setLeaving(false); setReason(""); done(); },
  });

  const end = active ? new Date(active.plannedEndsAt).getTime() : 0;
  const promptAt = end + PROMPT_AFTER_END_MIN * 60_000;
  const alertAt = promptAt + ALERT_AFTER_PROMPT_MIN * 60_000;
  const phase = !active ? "none" : now < end ? "before" : now < promptAt ? "grace" : now < alertAt ? "prompt" : "alert";

  return (
    <Card data-testid="safety-active">
      <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-base"><TimerReset className="size-4" aria-hidden /> {t("nurse.safety.timerTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {route.isLoading ? <LoadingBlock /> : null}
        {route.isError ? <ErrorBlock error={route.error} onRetry={() => void route.refetch()} /> : null}
        {aborted ? <div className="kx-callout" data-tone="good" role="status" data-testid="abort-done"><ShieldCheck className="size-5 shrink-0 text-[hsl(var(--success))]" aria-hidden /><p className="text-sm">{t("nurse.safety.abortDone")}</p></div> : null}
        {!active && route.data ? <EmptyBlock message={t("nurse.safety.noActive")} /> : null}
        {active ? (
          <>
            <p className="text-sm">{active.patient.name ?? active.district} · {fmtDateTime(active.plannedStartsAt)} <StatusPill tone="ok">{t(`homeVisits.state.${active.state}`)}</StatusPill></p>
            <div className="kx-callout" data-tone={phase === "alert" ? "danger" : phase === "prompt" ? "warn" : phase === "grace" ? "info" : "good"} data-phase-callout={phase}>
              {phase === "alert" ? <Siren className="size-6 shrink-0 text-[hsl(var(--danger-text))]" aria-hidden /> : phase === "prompt" ? <TimerReset className="size-6 shrink-0 text-[hsl(var(--warning))]" aria-hidden /> : <ShieldCheck className="size-6 shrink-0 text-[hsl(var(--success))]" aria-hidden />}
              <p className="text-xl font-semibold leading-snug tabular-nums" data-testid="safety-timer" data-phase={phase} role="timer" aria-live="off">
                {phase === "before" ? t("nurse.safety.phase.before", { time: mmss(promptAt - now) }) : null}
                {phase === "grace" ? t("nurse.safety.phase.grace", { time: mmss(promptAt - now) }) : null}
                {phase === "prompt" ? t("nurse.safety.phase.prompt", { time: mmss(alertAt - now) }) : null}
                {phase === "alert" ? t("nurse.safety.phase.alert") : null}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t("nurse.safety.timerHelp", { prompt: PROMPT_AFTER_END_MIN, alert: ALERT_AFTER_PROMPT_MIN })}</p>
            <div className="grid gap-3">
              <Button size="lg" className="min-h-14 w-full text-base" disabled={answer.isPending} onClick={() => answer.mutate()} data-testid="safety-answer"><ShieldCheck className="size-5" aria-hidden /> {t("nurse.safety.imSafe")}</Button>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="destructive" size="lg" className="min-h-14 w-full text-base" disabled={sosM.isPending} onClick={() => sosM.mutate()} data-testid="safety-sos"><Siren className="size-5" aria-hidden /> {t("homeVisits.sos")}</Button>
                <Button variant="outline" size="lg" className="min-h-14 w-full text-base" onClick={() => setLeaving((x) => !x)} data-testid="safety-leave">{t("homeVisits.leaveUnsafe")}</Button>
              </div>
            </div>
            {sos ? (
              <div className="kx-callout" data-tone="danger" role="alert" data-testid="sos-panel">
                <Siren className="mt-0.5 size-6 shrink-0 text-[hsl(var(--danger-text))]" aria-hidden />
                <div>
                  <p className="font-semibold">{sos.delivered ? t("homeVisits.sosSent") : t("homeVisits.sosNotDelivered")}</p>
                  <p className="text-sm">{t("homeVisits.callAmbulance", { number: sos.show.ambulance })} · {t("homeVisits.callPolice", { number: sos.show.police })}</p>
                </div>
              </div>
            ) : null}
            {leaving ? (
              <form className="kx-callout flex-col" data-tone="warn" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) abort.mutate(); }} data-testid="abort-form">
                <p className="text-sm text-muted-foreground">{t("homeVisits.unsafeHelp")}</p>
                <Field label={t("nurse.safety.abortCategory")} htmlFor="abort-cat">
                  <select id="abort-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                    {ABORT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`nurse.safety.categories.${c}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("homeVisits.unsafeReason")} htmlFor="abort-reason"><Input id="abort-reason" className="min-h-11" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                {abort.isError ? <ErrorBlock error={abort.error} /> : null}
                <Button type="submit" variant="destructive" size="lg" className="min-h-14 w-full text-base" disabled={!reason.trim() || abort.isPending} data-testid="abort-confirm">{t("homeVisits.confirmLeave")}</Button>
              </form>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SafetyContactCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const contact = useQuery({ queryKey: ["home-visits", "safety-contact"], queryFn: () => apiGet<{ name: string | null; configured: boolean }>("/api/v1/home-visits/safety-contact") });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const save = useMutation({
    mutationFn: () => apiPut(`/api/v1/home-visits/safety-contact`, { name: name.trim(), phone: phone.trim() }),
    onSuccess: () => { toast.success(t("nurse.safety.contactSaved")); setPhone(""); void qc.invalidateQueries({ queryKey: ["home-visits", "safety-contact"] }); },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Card data-testid="safety-contact">
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.safety.contactTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {contact.isLoading ? <LoadingBlock /> : null}
        {contact.isError ? <ErrorBlock error={contact.error} /> : null}
        {contact.data ? (
          contact.data.configured ? <p className="text-sm">{t("nurse.safety.contactSet", { name: contact.data.name ?? "" })}</p> : <div className="kx-callout" data-tone="warn" role="alert"><Siren className="size-5 shrink-0 text-[hsl(var(--warning))]" aria-hidden /><p className="text-sm font-medium">{t("nurse.safety.contactMissing")}</p></div>
        ) : null}
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && phone.trim()) save.mutate(); }}>
          <Field label={t("nurse.safety.contactName")} htmlFor="sc-name"><Input id="sc-name" className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t("nurse.safety.contactPhone")} htmlFor="sc-phone"><Input id="sc-phone" type="tel" inputMode="tel" className="min-h-11" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button type="submit" variant="outline" className="min-h-11" disabled={!name.trim() || !phone.trim() || save.isPending}>{t("nurse.common.save")}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function AlertsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["home-visits", "alerts"], queryFn: () => apiGet<{ items: Alert[] }>("/api/v1/home-visits/safety-alerts"), retry: false, refetchInterval: 30_000 });
  const act = useMutation({ mutationFn: (p: { id: string; a: "ack" | "resolve" }) => apiPost(`/api/v1/home-visits/safety-alerts/${p.id}/${p.a}`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: ["home-visits", "alerts"] }) });
  if (alerts.isError) return null; // managers only: a nurse without the role simply does not see this card
  return (
    <Card data-testid="safety-alerts">
      <CardHeader className="pb-1"><CardTitle className="text-base">{t("nurse.safety.alertsTitle")}</CardTitle></CardHeader>
      <CardContent>
        {alerts.isLoading ? <LoadingBlock /> : null}
        {alerts.data && alerts.data.items.length === 0 ? <EmptyBlock message={t("nurse.safety.noAlerts")} /> : null}
        <ul className="divide-y text-sm">
          {alerts.data?.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{t(`nurse.safety.alertKind.${a.kind}`)} · {fmtDateTime(a.raisedAt)} · <StatusPill tone={a.status === "RESOLVED" ? "muted" : a.status === "ESCALATED" || a.status === "FAILED" ? "bad" : "warn"}>{a.status}</StatusPill></span>
              {a.status !== "RESOLVED" ? (
                <span className="flex gap-2">
                  {a.status !== "ACKNOWLEDGED" ? <Button size="sm" variant="outline" className="min-h-11" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, a: "ack" })}>{t("nurse.safety.ack")}</Button> : null}
                  <Button size="sm" variant="outline" className="min-h-11" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, a: "resolve" })}>{t("nurse.safety.resolve")}</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
