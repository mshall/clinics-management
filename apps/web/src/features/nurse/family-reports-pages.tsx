import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/http";
import { EmptyBlock, ErrorBlock, Field, GateNotice, LoadingBlock, money, PageShell, PatientPicker, StatusPill, todayIso, useIsAgency, useNurseContext, useErrorText, type PatientLite, type RosterItem } from "./nurse-shared";

type Contact = { linkId: string; relation: string; patientId: string; name: string; phone: string; consentGranted: boolean };

/** KNFAM01 — family contacts of a patient and their explicit WhatsApp consent for visit summaries. The message is mock-delivered (dev inbox) and carries only a link. */
export function FamilyPage() {
  const { t } = useTranslation();
  const ctx = useNurseContext();
  const qc = useQueryClient();
  const errText = useErrorText();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const familyOff = ctx.data ? ctx.data.features["nurse.family_updates"] === false : false;
  const contacts = useQuery({ queryKey: ["nurse", "family", patient?.id], queryFn: () => apiGet<{ items: Contact[] }>(`/api/v1/nurse/patients/${patient!.id}/family-contacts`), enabled: Boolean(patient) });
  const setConsent = useMutation({
    mutationFn: (p: { id: string; granted: boolean }) => apiPut(`/api/v1/nurse/patients/${patient!.id}/family-contacts/${p.id}/consent`, { granted: p.granted }),
    onSuccess: () => { toast.success(t("nurse.family.consentSaved")); void qc.invalidateQueries({ queryKey: ["nurse", "family", patient?.id] }); },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <PageShell title={t("nurse.family.title")} subtitle={t("nurse.family.subtitle")} testId="nurse-family">
      {familyOff ? <GateNotice feature="nurse.family_updates" /> : null}
      <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("nurse.family.privacy")}</p>
      <PatientPicker value={patient} onChange={setPatient} />
      {patient ? (
        <>
          {contacts.isLoading ? <LoadingBlock /> : null}
          {contacts.isError ? <ErrorBlock error={contacts.error} onRetry={() => void contacts.refetch()} /> : null}
          {contacts.data && contacts.data.items.length === 0 ? <EmptyBlock message={t("nurse.family.noContacts")} /> : null}
          <ul className="space-y-2">
            {contacts.data?.items.map((c) => (
              <li key={c.linkId}>
                <Card data-testid="family-contact">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                    <span>{c.name} · {c.relation} · {c.phone}</span>
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" className="size-5" checked={c.consentGranted} disabled={setConsent.isPending} onChange={(e) => setConsent.mutate({ id: c.patientId, granted: e.target.checked })} />
                      {t("nurse.family.consent")}
                    </label>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("nurse.family.addHelp")} <Link className="text-primary underline" to={`/patients/${patient.id}`}>{t("nurse.family.openPatient")}</Link></p>
        </>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("nurse.family.mock")} <Link className="text-primary underline" to="/dev/inbox">{t("nurse.family.devInbox")}</Link></p>
    </PageShell>
  );
}

type Summary = { visitsDone: number; hours: number; revenue: string; homeSurchargeRevenue: string; travelMinutes: number; planCompletionPercent: number | null; missedVisitRatePercent: number | null; safetyAlerts: number };

/** KNRPT01 — visits done, hours, revenue, travel time, plan completion, missed-visit rate, safety alerts (aggregates only). */
export function NurseReportsPage() {
  const { t } = useTranslation();
  const agency = useIsAgency();
  const [from, setFrom] = useState(todayIso(-30));
  const [to, setTo] = useState(todayIso(1));
  const [nurseId, setNurseId] = useState("");
  const roster = useQuery({ queryKey: ["nurse", "roster"], queryFn: () => apiGet<{ items: RosterItem[] }>("/api/v1/nurse/agency/roster"), enabled: agency, retry: false });
  const valid = from && to && to > from;
  const q = useQuery({
    queryKey: ["nurse", "reports", from, to, nurseId],
    queryFn: () => apiGet<Summary>(`/api/v1/nurse/reports/summary?from=${new Date(`${from}T00:00:00`).toISOString()}&to=${new Date(`${to}T00:00:00`).toISOString()}${nurseId ? `&nurseId=${nurseId}` : ""}`),
    enabled: Boolean(valid),
  });
  const pct = (v: number | null) => (v == null ? "-" : `${v}%`);
  const tiles: [string, string][] = q.data
    ? [
        ["visitsDone", String(q.data.visitsDone)],
        ["hours", String(q.data.hours)],
        ["revenue", money(q.data.revenue)],
        ["surcharge", money(q.data.homeSurchargeRevenue)],
        ["travel", t("nurse.reports.minutes", { count: q.data.travelMinutes })],
        ["planCompletion", pct(q.data.planCompletionPercent)],
        ["missed", pct(q.data.missedVisitRatePercent)],
        ["alerts", String(q.data.safetyAlerts)],
      ]
    : [];
  return (
    <PageShell title={t("nurse.reports.title")} subtitle={t("nurse.reports.subtitle")} testId="nurse-reports">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("nurse.reports.from")} htmlFor="rp-from"><Input id="rp-from" type="date" className="min-h-11" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("nurse.reports.to")} htmlFor="rp-to"><Input id="rp-to" type="date" className="min-h-11" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {agency ? (
          <Field label={t("nurse.common.nurse")} htmlFor="rp-nurse">
            <select id="rp-nurse" className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
              <option value="">{t("nurse.common.all")}</option>
              {roster.data?.items.filter((r) => r.kind === "NURSE").map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      {!valid ? <p className="text-sm text-destructive" role="alert">{t("nurse.reports.invalidRange")}</p> : null}
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.visitsDone === 0 && q.data.safetyAlerts === 0 ? <EmptyBlock message={t("nurse.reports.empty")} /> : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="reports-tiles">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-lg border p-3" data-testid={`tile-${k}`}>
            <dt className="text-xs text-muted-foreground">{t(`nurse.reports.tiles.${k}`)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{t("nurse.reports.aggregatesOnly")}</p>
    </PageShell>
  );
}

type FamilySummary = { nurseFirstName: string | null; visitDate: string | null; tasksDone: string[]; status: "COMPLETED" };

/** Public family summary (`/f/:token`): nurse first name, date and tasks done. No login, no vitals, no medicines, no address. */
export function FamilySummaryPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["family-summary", token], queryFn: () => apiGet<FamilySummary>(`/api/v1/public/nurse/family/${encodeURIComponent(token)}`), retry: false });
  return (
    <main className="mx-auto max-w-md space-y-4 p-6" data-testid="family-summary">
      <h1 className="text-xl font-semibold">{t("nurse.family.summaryTitle")}</h1>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">{t("nurse.family.summaryInvalid")}</p> : null}
      {q.data ? (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <StatusPill tone="ok">{t("nurse.family.completed")}</StatusPill>
            <p>{t("nurse.family.summaryLine", { nurse: q.data.nurseFirstName ?? "-", date: q.data.visitDate ?? "-" })}</p>
            {q.data.tasksDone.length ? <ul className="list-disc ps-5">{q.data.tasksDone.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
            <p className="text-xs text-muted-foreground">{t("nurse.family.summaryFooter")}</p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
