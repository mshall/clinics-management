import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, Pill } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch } from "@/lib/http";
import { CallView } from "./call-view";
import { DeviceCheck } from "./device-check";
import { getSession, joinAsClinician, staffFetcher } from "./telehealth-api";
import { HttpPollingClient } from "./webrtc/signaling-client";
import { useCall, type Devices } from "./webrtc/use-call";

type EncounterLite = { id: string; status: string; subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null };

/** Clinician call page /telehealth/:sessionId: video + side panel with the pre-filled Telehealth encounter (notes, prescription, open full encounter). */
export function TelehealthCallPage() {
  const { sessionId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["telehealth-session", sessionId], queryFn: () => getSession(sessionId), refetchInterval: 10_000 });
  const client = useMemo(() => new HttpPollingClient(`/api/v1/telehealth/sessions/${sessionId}`, staffFetcher), [sessionId]);
  const call = useCall({ polite: false, client, join: () => joinAsClinician(sessionId) });
  const [joining, setJoining] = useState(false);

  // The encounter appears once both attended (3 min): look it up through the appointment.
  const apt = useQuery({
    queryKey: ["telehealth-appointment", session.data?.appointmentId, call.attended],
    enabled: Boolean(session.data?.appointmentId),
    queryFn: () => apiGet<{ openEncounterId?: string | null }>(`/api/v1/appointments/${session.data!.appointmentId}`),
    refetchInterval: call.phase === "live" ? 15_000 : false,
  });
  const encounterId = apt.data?.openEncounterId ?? null;
  const enc = useQuery({ queryKey: ["telehealth-enc", encounterId], enabled: Boolean(encounterId), queryFn: () => apiGet<EncounterLite>(`/api/v1/encounters/${encounterId}`) });
  const [notes, setNotes] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  useEffect(() => {
    if (enc.data) setNotes({ subjective: enc.data.subjective ?? "", objective: enc.data.objective ?? "", assessment: enc.data.assessment ?? "", plan: enc.data.plan ?? "" });
  }, [enc.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => apiPatch(`/api/v1/encounters/${encounterId}`, notes),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telehealth-enc", encounterId] }),
  });

  const s = session.data;
  if (session.isError) return <div className="p-6" role="alert">{t("telehealth.call.loadError", "This visit is not available to you.")} <Link className="underline" to="/appointments">{t("telehealth.call.back", "Back")}</Link></div>;

  const field = (k: keyof typeof notes, label: string) => (
    <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span>
      <Textarea rows={3} value={notes[k]} onChange={(e) => setNotes((n) => ({ ...n, [k]: e.target.value }))} disabled={!encounterId || enc.data?.status === "FINALIZED"} />
    </label>
  );

  return (
    <div className="mx-auto grid min-h-dvh max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]" data-testid="th-clinician-page">
      <section className="grid content-start gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(s ? `/appointments/${s.appointmentId}` : "/appointments")}><ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />{t("telehealth.call.back", "Back")}</Button>
          <h1 className="text-lg font-semibold">{t("telehealth.call.title", "Video visit")}{s ? ` · ${s.patientName}` : ""}</h1>
        </div>
        {call.phase === "idle" ? (
          <DeviceCheck busy={joining} joinLabel={t("telehealth.call.start", "Start video visit")} onJoin={(d: Devices) => { setJoining(true); void call.start(d).finally(() => setJoining(false)); }} />
        ) : call.phase === "ended" ? (
          <Card data-testid="th-ended"><CardContent className="grid gap-3 p-6 text-center"><p className="font-medium">{t("telehealth.call.endedClinician", "The visit has ended.")}</p>
            {encounterId ? <Button asChild><Link to={`/encounters/${encounterId}`}>{t("telehealth.call.openEncounter", "Open encounter")}</Link></Button> : null}</CardContent></Card>
        ) : call.phase === "error" ? (
          <Card role="alert" data-testid="th-error"><CardContent className="grid gap-3 p-6 text-center">
            <p className="font-medium">{(call.error as { body?: { code?: string } } | null)?.body?.code === "TELEHEALTH_TOO_EARLY" ? t("telehealth.call.tooEarly", "The room opens 10 minutes before the start time.") : t("telehealth.public.joinError", "We could not start the visit. Please try again.")}</p>
            <Button type="button" onClick={() => window.location.reload()}>{t("telehealth.device.retry", "Try again")}</Button></CardContent></Card>
        ) : (
          <CallView {...call} peerLabel={s?.patientName ?? t("telehealth.call.patient", "the patient")} />
        )}
      </section>
      <aside className="grid content-start gap-3" aria-label={t("telehealth.call.sidePanel", "Visit notes")}>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />{t("telehealth.call.notes", "Visit notes")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {!encounterId ? <p className="text-sm text-muted-foreground" data-testid="th-no-encounter">{t("telehealth.call.encounterPending", "The encounter is created automatically once you and the patient have both been in the call for 3 minutes.")}</p> : null}
            {field("subjective", t("encounters.subjective", "Subjective"))}
            {field("objective", t("encounters.objective", "Objective"))}
            {field("assessment", t("encounters.assessment", "Assessment"))}
            {field("plan", t("encounters.plan", "Plan"))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={!encounterId || save.isPending || enc.data?.status === "FINALIZED"} onClick={() => save.mutate()}>{t("common.save", "Save")}</Button>
              {encounterId ? (
                <>
                  <Button asChild size="sm" variant="outline"><a href={`/encounters/${encounterId}`} target="_blank" rel="noreferrer"><ExternalLink className="me-1.5 h-4 w-4" />{t("telehealth.call.openEncounter", "Open encounter")}</a></Button>
                  <Button asChild size="sm" variant="outline"><a href={`/encounters/${encounterId}#prescription`} target="_blank" rel="noreferrer"><Pill className="me-1.5 h-4 w-4" />{t("telehealth.call.prescription", "E-prescription")}</a></Button>
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("telehealth.call.roles", "The doctor, an assistant or the group supervisor can complete the encounter; only the doctor or supervisor signs.")}</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
