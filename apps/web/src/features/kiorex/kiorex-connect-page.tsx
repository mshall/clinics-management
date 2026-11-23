import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinicsQuery } from "@/lib/api-hooks";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/http";
import { KiorexConnectPassportCard } from "./kiorex-connect-passport-card";
import "./kiorex-connect-i18n";
import type { ConnectDto, ConnectStepDto, ConnectStepStatus } from "./kiorex-connect-types";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

const ICON: Record<ConnectStepStatus, typeof CheckCircle2> = { done: CheckCircle2, action_needed: AlertCircle, waiting_kiorex: Clock, blocked: Lock };
const TONE: Record<ConnectStepStatus, string> = { done: "text-emerald-600", action_needed: "text-amber-600", waiting_kiorex: "text-sky-600", blocked: "text-muted-foreground" };

/** Keep non-component exports out of this module so `lazyNamed` can load the page. */
const connectKey = (clinicId: string) => ["kiorex", "connect", clinicId] as const;
function useKiorexConnect(clinicId: string) {
  return useQuery({
    queryKey: connectKey(clinicId),
    queryFn: () => apiGet<ConnectDto>(`/api/v1/kiorex/connect?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId),
    refetchInterval: (q) => (q.state.data?.status === "REQUESTED" ? 15_000 : false),
  });
}

function detailText(t: TFunction, s: ConnectStepDto): string {
  const d = (s.detail ?? {}) as Record<string, number | string[]>;
  if (s.key === "credentials") {
    return [
      t("kiorexConnect.detail.verified", d),
      Number(d.pending) > 0 ? t("kiorexConnect.detail.pending", d) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (s.key === "appointment_types") return t("kiorexConnect.detail.bookable", { withFee: d.withFee });
  if (s.key === "availability" || s.key === "profile") return t("kiorexConnect.detail.doctors", d);
  if (s.key === "live") return t("kiorexConnect.detail.live", d);
  return "";
}
function feeText(feeCard: ConnectDto["feeCard"], locale: string): string | null {
  const rows = (feeCard?.rates ?? feeCard?.items ?? (feeCard?.defaultRate ? [feeCard.defaultRate] : [])) as ConnectDto["feeCard"] extends infer _ ? Array<{ specialty: string | null; feeType: string; amount: string | null; percent: string | null }> : never;
  const r = rows.find((x) => x.specialty == null) ?? rows[0];
  if (!r) return null;
  const cur = feeCard?.currency ?? "EGP";
  if (r.feeType === "PERCENT" && r.percent) return `${new Intl.NumberFormat(locale).format(Number(r.percent))}%`;
  if (r.amount) return `${cur} ${new Intl.NumberFormat(locale).format(Number(r.amount))}`;
  return null;
}

function TermsCard({ data, clinicId }: { data: ConnectDto; clinicId: string }) {
  const { t, i18n } = useTranslation(); const qc = useQueryClient(); const [ack, setAck] = useState(false);
  const fee = feeText(data.feeCard, i18n.language);
  const save = useMutation({
    mutationFn: () => apiPut<ConnectDto>("/api/v1/kiorex/connect/consent", { clinicId, termsVersion: data.termsVersion, feeAcknowledged: true }),
    onSuccess: (d) => { qc.setQueryData(connectKey(clinicId), d); toast.success(t("kiorexConnect.terms.accepted")); },
    onError: (e) => toast.error(e instanceof ApiError ? t(`kiorexConnect.err.${(e as ApiError & { code?: string }).code ?? ""}`, { defaultValue: e.message }) : String(e)),
  });
  return (
    <Card data-testid="connect-terms">
      <CardHeader className="space-y-1.5"><CardTitle className="text-base">{t("kiorexConnect.terms.title")}</CardTitle><CardDescription>{t("kiorexConnect.terms.body", { version: data.termsVersion })}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm" data-testid="connect-fee-text">{fee ? t("kiorexConnect.terms.fee", { fee }) : t("kiorexConnect.terms.feeUnconfigured")}</p>
        {data.consent?.feeAcknowledged ? <p className="text-sm text-emerald-700" data-testid="connect-consent-done">{t("kiorexConnect.terms.accepted")} · {new Date(data.consent.at).toLocaleDateString(i18n.language)}</p> : (
          <>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="connect-ack" />{t("kiorexConnect.terms.ack")}</label>
            <Button disabled={!ack || !fee || save.isPending} onClick={() => save.mutate()} data-testid="connect-accept">{t("kiorexConnect.terms.accept")}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Connect to Kiorex wizard (ADR-040, Clinic + Nurse edition): a checklist computed by the API from real state, one deep link per fix. */
export function KiorexConnectPage() {
  const { t, i18n } = useTranslation(); const qc = useQueryClient();
  const clinics = useClinicsQuery(); const [clinicId, setClinicId] = useState("");
  useSyncOnChange([clinicId, clinics.data?.[0]?.id], () => { if (!clinicId && clinics.data?.length) setClinicId(clinics.data[0]!.id); });
  const q = useKiorexConnect(clinicId);
  const request = useMutation({
    mutationFn: () => apiPost<ConnectDto>("/api/v1/kiorex/connect/request", { clinicId }),
    onSuccess: (d) => { qc.setQueryData(connectKey(clinicId), d); toast.success(t("kiorexConnect.requested")); },
    onError: (e) => toast.error(e instanceof ApiError ? t(`kiorexConnect.err.${(e as ApiError & { code?: string }).code ?? ""}`, { defaultValue: e.message }) : String(e)),
  });
  const refresh = useMutation({ mutationFn: () => apiPost<ConnectDto>("/api/v1/kiorex/connect/refresh", { clinicId }), onSuccess: (d) => qc.setQueryData(connectKey(clinicId), d) });
  const pause = useMutation({
    mutationFn: (v: { id: string; paused: boolean }) => apiPost(`/api/v1/marketplace/listings/${v.id}/pause?paused=${v.paused}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: connectKey(clinicId) }),
  });
  const d = q.data;
  const link = (s: ConnectStepDto) => (s.link ? s.link.replace(":clinicId", clinicId) : undefined);
  return (
    <div className="space-y-6" data-testid="kiorex-connect">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl"><h1 className="text-2xl font-semibold tracking-tight">{t("kiorexConnect.title")}</h1><p className="text-sm text-muted-foreground">{t("kiorexConnect.subtitle")}</p></div>
        {clinics.data && clinics.data.length > 1 ? (
          <select aria-label={t("kiorexTab.clinic", "Branch")} className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.data.map((c) => <option key={c.id} value={c.id}>{i18n.language.startsWith("ar") ? c.nameAr || c.nameEn : c.nameEn}</option>)}
          </select>
        ) : null}
      </div>
      {q.isError ? <p className="text-sm text-destructive">{t("kiorexTab.loadError", "Kiorex settings are available to clinic owners and managers.")}</p> : null}
      {d?.legacy ? <p className="rounded-xl border p-4 text-sm" data-testid="connect-legacy">{t("kiorexConnect.legacy")}</p> : null}
      {d && !d.legacy ? (
        <>
          <div role="progressbar" aria-valuenow={d.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("kiorexConnect.progress")} data-testid="connect-progress">
            <div className="mb-1 flex items-center justify-between text-sm"><span>{t("kiorexConnect.progress")} · <b data-testid="connect-status">{t(`kiorexConnect.status.${d.status}`)}</b></span><b>{d.progress}%</b></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${d.progress}%` }} /></div>
          </div>
          <ol className="space-y-3" data-testid="connect-steps">
            {d.steps.map((s, i) => {
              const Icon = ICON[s.status]; const href = link(s); const dt = detailText(t, s);
              const missing = s.key === "profile" ? ((s.detail?.missing ?? []) as string[]) : [];
              return (
                <li key={s.key} data-testid={`connect-step-${s.key}`} data-status={s.status} className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-4">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[s.status]}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><b>{i + 1}. {t(`kiorexConnect.step.${s.key}.title`)}</b>{s.optional ? <span className="rounded-full border px-2 text-xs text-muted-foreground">{t("kiorexConnect.optional")}</span> : null}<span className={`text-xs font-medium ${TONE[s.status]}`}>{t(`kiorexConnect.state.${s.status}`)}</span></div>
                    <p className="text-sm text-muted-foreground">{t(`kiorexConnect.step.${s.key}.hint`)}</p>
                    {dt ? <p className="mt-1 text-xs text-muted-foreground">{dt}</p> : null}
                    {missing.length && s.status !== "done" ? <p className="mt-1 text-xs">{t("kiorexConnect.missingLabel")}: {missing.map((m) => t(`kiorexConnect.missing.${m}`)).join(", ")}</p> : null}
                  </div>
                  {href && s.status !== "done" && s.status !== "waiting_kiorex" && s.key !== "request" ? <Button asChild size="sm" variant="outline"><Link to={href}>{t("kiorexConnect.fix")}</Link></Button> : null}
                  {s.key === "request" && (s.status === "action_needed" || s.status === "waiting_kiorex") ? <Button size="sm" disabled={!d.canRequest || request.isPending} onClick={() => request.mutate()} data-testid="connect-request">{t("kiorexConnect.request")}</Button> : null}
                </li>
              );
            })}
          </ol>
          {d.steps.find((s) => s.key === "consent")?.status !== "done" || d.consent ? <TermsCard data={d} clinicId={clinicId} /> : null}
          <Card data-testid="connect-doctors">
            <CardHeader className="space-y-1.5"><CardTitle className="text-base">{t("kiorexConnect.doctors")}</CardTitle><CardDescription>{t("kiorexConnect.pauseTitle")}</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {d.doctors.map((x) => (
                <div key={x.listingId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm" data-testid={`connect-doctor-${x.listingId}`} data-ready={x.ready}>
                  <div className="min-w-0"><b dir="auto">{x.name}</b>
                    <div className="text-xs text-muted-foreground">{t("kiorexConnect.doctor.verification")}: {x.verification} · {t("kiorexConnect.doctor.availability")}: {x.hasAvailability ? "✓" : "✗"} · {t("kiorexConnect.doctor.profile")}: {x.profilePercent}% · {t("kiorexConnect.doctor.status")}: {x.status}</div></div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={`/clinics/${clinicId}/kiorex-listings/${x.listingId}/profile`}>{t("kiorexConnect.fix")}</Link></Button>
                    {x.status === "LIVE" ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate({ id: x.listingId, paused: true })}>{t("kiorexConnect.pause")}</Button> : null}
                    {x.status === "PAUSED" && x.pausedReason === "owner" ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate({ id: x.listingId, paused: false })}>{t("kiorexConnect.resume")}</Button> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {d.status === "APPROVED" && d.steps.find((s) => s.key === "live")?.status === "done" ? <KiorexConnectPassportCard /> : null}
          {["REQUESTED", "CHANGES_REQUESTED", "REJECTED", "PAUSED"].includes(d.status) ? <Button variant="ghost" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw aria-hidden="true" />{t("kiorexConnect.refresh")}</Button> : null}
        </>
      ) : null}
    </div>
  );
}
