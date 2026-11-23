import { Camera, Mic, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { detectPlatform } from "./platform";
import type { Devices } from "./webrtc/use-call";

/** Pre-call device check: preview, camera/mic/speaker selectors, permission-help text per platform (Android Chrome / iOS Safari). */
export function DeviceCheck({ onJoin, joinLabel, busy }: { onJoin: (d: Devices) => void; joinLabel: string; busy?: boolean }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioId, setAudioId] = useState<string>("");
  const [videoId, setVideoId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [denied, setDenied] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const platform = detectPlatform(typeof navigator !== "undefined" ? navigator.userAgent : "");

  const stop = () => streamRef.current?.getTracks().forEach((tr) => tr.stop());

  const open = useCallback(async (aId?: string, vId?: string) => {
    stop();
    setDenied(false);
    try {
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: aId ? { deviceId: { exact: aId } } : true, video: vId ? { deviceId: { exact: vId } } : { facingMode: "user" } });
        setNoCamera(false);
      } catch (e) {
        if ((e as DOMException).name === "NotFoundError" || (e as DOMException).name === "OverconstrainedError") {
          s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setNoCamera(true);
        } else throw e;
      }
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setDenied(true);
    }
  }, []);

  useEffect(() => {
    void open();
    return stop;
  }, [open]);

  const list = (k: MediaDeviceKind) => devices.filter((d) => d.kind === k);
  const select = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const sel = (id: string, set: (v: string) => void, kind: MediaDeviceKind, label: string, icon: React.ReactNode, apply?: (v: string) => void) => (
    <label className="grid gap-1 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
      <select className={select} value={id} onChange={(e) => { set(e.target.value); apply?.(e.target.value); }} aria-label={label}>
        <option value="">{t("telehealth.device.default", "Default")}</option>
        {list(kind).map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `${kind} ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="grid gap-4" data-testid="th-device-check">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" data-testid="th-preview" />
        {(denied || noCamera) && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm text-white">
            {denied ? t("telehealth.device.denied", "Camera or microphone access is blocked.") : t("telehealth.device.noCamera", "No camera found. You can join with audio only.")}
          </div>
        )}
      </div>
      {denied && (
        <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">{t("telehealth.device.helpTitle", "How to allow camera and microphone")}</p>
          <p className="mt-1 text-muted-foreground">
            {platform === "ios-app"
              ? t("telehealth.device.helpIosApp", "iPhone: open Settings, find this app in the list, turn on Camera and Microphone, then come back and tap Try again.")
              : platform === "android-app"
                ? t("telehealth.device.helpAndroidApp", "Android: open Settings > Apps > this app > Permissions, allow Camera and Microphone, then come back and tap Try again.")
                : platform === "ios-safari"
              ? t("telehealth.device.helpIos", "iPhone: open Settings > Safari > Camera and Microphone and choose Allow, then reload this page. If you opened the link inside another app, open it in Safari.")
              : platform === "android-chrome"
                ? t("telehealth.device.helpAndroid", "Android: tap the lock icon next to the address, open Permissions, allow Camera and Microphone, then reload. In an app, allow its camera and microphone permissions in Android Settings.")
                : t("telehealth.device.helpOther", "Click the camera icon in the address bar, allow Camera and Microphone for this site, then reload.")}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void open(audioId || undefined, videoId || undefined)}>{t("telehealth.device.retry", "Try again")}</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {sel(videoId, setVideoId, "videoinput", t("telehealth.device.camera", "Camera"), <Camera className="h-4 w-4" />, (v) => void open(audioId || undefined, v || undefined))}
        {sel(audioId, setAudioId, "audioinput", t("telehealth.device.microphone", "Microphone"), <Mic className="h-4 w-4" />, (v) => void open(v || undefined, videoId || undefined))}
        {sel(speakerId, setSpeakerId, "audiooutput", t("telehealth.device.speaker", "Speaker"), <Volume2 className="h-4 w-4" />, (v) => {
          const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
          void el?.setSinkId?.(v);
        })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} />
        {t("telehealth.device.audioOnly", "Join with audio only")}
      </label>
      <Button type="button" size="lg" disabled={busy || denied} data-testid="th-join" onClick={() => { stop(); onJoin({ audioId: audioId || undefined, videoId: videoId || undefined, audioOnly: audioOnly || noCamera }); }}>
        {joinLabel}
      </Button>
    </div>
  );
}
