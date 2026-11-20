import { useMutation } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AiFeatureLabel } from "@/components/ai-feature-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost } from "@/lib/http";

type DraftNote = {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  localeNote?: string;
};

type ScribeSession = {
  id: string;
  status: string;
  transcript?: string | null;
  draftNote?: DraftNote | null;
  draftLatencyMs?: number | null;
  audioChunkCount?: number;
  hasPersistedAudio?: boolean;
  pilotBenchmarkOk?: boolean;
};

type Props = {
  encounterId: string;
  disabled?: boolean;
  onApplySoap: (partial: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }) => void;
};

function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
    return String((e.body as { message?: string }).message);
  }
  return e instanceof Error ? e.message : String(e);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function EncounterScribePanel({ encounterId, disabled, onApplySoap }: Props) {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(false);
  const [retainAudio, setRetainAudio] = useState(false);
  const [session, setSession] = useState<ScribeSession | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const seqRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      mediaRef.current?.stop();
    };
  }, []);

  const startMut = useMutation({
    mutationFn: async () => {
      const s = await apiPost<ScribeSession>(`/api/v1/clinic-ai/encounters/${encounterId}/scribe/start`, {
        patientConsent: consent,
        retainAudioAfterSignOff: retainAudio,
      });
      setSession(s);
      seqRef.current = 0;
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      rec.ondataavailable = async (ev) => {
        if (!ev.data.size) return;
        chunksRef.current.push(ev.data);
        const payloadB64 = await blobToBase64(ev.data);
        const seq = seqRef.current++;
        await apiPost(`/api/v1/clinic-ai/scribe/${s.id}/audio`, {
          seq,
          mimeType: ev.data.type || "audio/webm",
          payloadB64,
        });
        setLiveTranscript((prev) => (prev ? `${prev} · …` : t("encounters.scribe.listening", "Listening (AR/EN)…")));
      };
      rec.start(4_000);
      setRecording(true);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const stopMut = useMutation({
    mutationFn: async () => {
      if (!session) return null;
      mediaRef.current?.stop();
      mediaRef.current?.stream.getTracks().forEach((tr) => tr.stop());
      setRecording(false);
      const audioSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const stopped = await apiPost<ScribeSession>(`/api/v1/clinic-ai/scribe/${session.id}/stop`, { audioSeconds });
      setSession(stopped);
      setLiveTranscript(stopped.transcript ?? "");
      return stopped;
    },
    onSuccess: (s) => {
      if (!s) return;
      toast.success(
        t("encounters.scribe.draftReady", "Draft ready in {{ms}} ms — review each field", {
          ms: s.draftLatencyMs ?? "?",
        }),
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!session?.draftNote) return null;
      const d = session.draftNote;
      onApplySoap({
        subjective: d.subjective,
        objective: d.objective,
        assessment: d.assessment,
        plan: d.plan,
      });
      const res = await apiPost<{ audioPurged: boolean }>(`/api/v1/clinic-ai/scribe/${session.id}/approve`, {
        subjective: d.subjective ?? "",
        objective: d.objective ?? "",
        assessment: d.assessment ?? "",
        plan: d.plan ?? "",
      });
      const refreshed = await apiGet<ScribeSession>(`/api/v1/clinic-ai/scribe/${session.id}`);
      setSession(refreshed);
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        res?.audioPurged
          ? t("encounters.scribe.approvedPurged", "Applied to chart; audio deleted")
          : t("encounters.scribe.approvedKept", "Applied to chart; audio retained per clinic setting"),
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (disabled) return null;

  return (
    <Card className="border-kx-ocean-600/20 bg-gradient-to-br from-kx-ocean-600/5 via-background to-emerald-500/5">
      <CardHeader className="pb-2">
        <AiFeatureLabel featureId="chart_scribe" showDisclosure />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <input
            id="scribe-consent"
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <Label htmlFor="scribe-consent" className="text-sm font-normal leading-snug">
            {t(
              "encounters.scribe.consent",
              "Patient consents to ambient AI recording for this visit (Egyptian Arabic / English).",
            )}
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="scribe-retain"
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={retainAudio}
            onChange={(e) => setRetainAudio(e.target.checked)}
          />
          <Label htmlFor="scribe-retain" className="text-sm font-normal leading-snug">
            {t("encounters.scribe.retainAudio", "Keep audio after sign-off (clinic opt-in; default deletes).")}
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          {!recording ? (
            <Button
              type="button"
              size="sm"
              disabled={!consent || startMut.isPending}
              onClick={() => startMut.mutate()}
              data-testid="scribe-record"
            >
              <Mic className="me-1 h-4 w-4" aria-hidden />
              {t("encounters.scribe.record", "Record")}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="destructive" disabled={stopMut.isPending} onClick={() => stopMut.mutate()}>
              <Square className="me-1 h-4 w-4" aria-hidden />
              {t("encounters.scribe.stop", "Stop & draft")}
            </Button>
          )}
          {session?.status === "READY" || session?.status === "APPROVED" ? (
            <Button type="button" size="sm" variant="secondary" disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
              {t("encounters.scribe.apply", "Review & apply to chart")}
            </Button>
          ) : null}
        </div>
        {liveTranscript ? (
          <Textarea readOnly rows={4} value={liveTranscript} className="text-sm" aria-label={t("encounters.scribe.transcript", "Transcript")} />
        ) : null}
        {session?.draftNote && (session.status === "READY" || session.status === "APPROVED") ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k} className="rounded-md border bg-background/80 p-2">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{k}</div>
                <p className="whitespace-pre-wrap">{session.draftNote?.[k] || "—"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
