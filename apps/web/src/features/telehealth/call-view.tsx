import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Quality } from "./webrtc/quality";
import type { CallPhase } from "./webrtc/use-call";

function MediaEl({ stream, muted, mirror, testId }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; testId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  // autoplay muted then unmute on interaction: WebViews block unmuted autoplay, so remote audio is unmuted by the join tap
  return <video ref={ref} autoPlay playsInline muted={muted} data-testid={testId} className={cn("h-full w-full object-cover", mirror && "-scale-x-100")} />;
}

const QUALITY_STYLE: Record<Quality, string> = { good: "bg-emerald-500", fair: "bg-amber-500", poor: "bg-red-500", unknown: "bg-muted-foreground" };

export function ConnectionQuality({ quality }: { quality: Quality }) {
  const { t } = useTranslation();
  const label = { good: t("telehealth.quality.good", "Good connection"), fair: t("telehealth.quality.fair", "Fair connection"), poor: t("telehealth.quality.poor", "Weak connection"), unknown: t("telehealth.quality.unknown", "Checking connection") }[quality];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white" data-testid="th-quality" data-quality={quality} title={label}>
      <span className={cn("h-2 w-2 rounded-full", QUALITY_STYLE[quality])} />
      {label}
    </span>
  );
}

export type CallControls = {
  phase: CallPhase;
  local: MediaStream | null;
  remote: MediaStream | null;
  connection: string;
  quality: Quality;
  reconnecting: boolean;
  muted: boolean;
  cameraOff: boolean;
  audioOnly: boolean;
  peerPresent: boolean;
  peerLabel: string;
  toggleMute: () => void;
  toggleCamera: () => void;
  setAudioOnlyMode: (on: boolean) => Promise<void>;
  hangUp: () => Promise<void>;
};

export function CallView(c: CallControls) {
  const { t } = useTranslation();
  const waiting = c.phase === "waiting" || (c.phase === "connecting" && !c.remote);
  return (
    <div className="grid gap-3" data-testid="th-call" data-connection-state={c.connection} data-phase={c.phase} data-audio-only={c.audioOnly ? "1" : "0"}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-950">
        <MediaEl stream={c.remote} testId="th-remote" />
        {c.audioOnly || !c.remote ? (
          <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/90">
            {waiting ? (
              <p>{c.phase === "waiting" ? t("telehealth.call.waitingFor", "Waiting for {{name}} to join…", { name: c.peerLabel }) : t("telehealth.call.connecting", "Connecting…")}</p>
            ) : c.audioOnly ? (
              <p className="flex items-center gap-2"><Volume2 className="h-5 w-5" />{t("telehealth.call.audioOnly", "Audio only")}</p>
            ) : null}
          </div>
        ) : null}
        <div className="absolute start-3 top-3 flex items-center gap-2">
          <ConnectionQuality quality={c.quality} />
          {c.reconnecting ? <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-medium text-black" role="status" data-testid="th-reconnecting">{t("telehealth.call.reconnecting", "Reconnecting…")}</span> : null}
        </div>
        <div className="absolute bottom-3 end-3 h-24 w-32 overflow-hidden rounded-lg border border-white/30 bg-black sm:h-28 sm:w-40">
          {c.cameraOff || c.audioOnly ? <div className="grid h-full place-items-center text-xs text-white/70"><VideoOff className="h-5 w-5" /></div> : <MediaEl stream={c.local} muted mirror testId="th-local" />}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant={c.muted ? "destructive" : "outline"} size="icon" onClick={c.toggleMute} aria-label={c.muted ? t("telehealth.call.unmute", "Unmute") : t("telehealth.call.mute", "Mute")} data-testid="th-mute">
          {c.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button type="button" variant={c.cameraOff ? "destructive" : "outline"} size="icon" disabled={c.audioOnly} onClick={c.toggleCamera} aria-label={c.cameraOff ? t("telehealth.call.cameraOn", "Turn camera on") : t("telehealth.call.cameraOff", "Turn camera off")} data-testid="th-camera">
          {c.cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </Button>
        <Button type="button" variant="outline" onClick={() => void c.setAudioOnlyMode(!c.audioOnly)} data-testid="th-audio-only">
          {c.audioOnly ? t("telehealth.call.videoOn", "Switch to video") : t("telehealth.call.audioOnlyBtn", "Audio only")}
        </Button>
        <Button type="button" variant="destructive" onClick={() => void c.hangUp()} data-testid="th-end">
          <PhoneOff className="me-2 h-5 w-5" />{t("telehealth.call.end", "End")}
        </Button>
      </div>
    </div>
  );
}
