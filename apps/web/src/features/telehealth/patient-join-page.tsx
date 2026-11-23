import { CalendarClock, Clock3, Globe, Hospital, ShieldAlert, VideoOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localeForLanguage } from "@/lib/locale-display";
import { CallView } from "./call-view";
import { DeviceCheck } from "./device-check";
import { getPublicInfo, joinAsPatient, publicBase, publicFetcher, type PublicInfo } from "./telehealth-api";
import { HttpPollingClient } from "./webrtc/signaling-client";
import { useCall, type Devices } from "./webrtc/use-call";

const POLL_INFO_MS = 15_000;

/**
 * Public patient page /v/:token. Works in a mobile WebView: no popups, no cookies/localStorage, playsInline video, join tap = user gesture.
 * Shows times in the DEVICE timezone (with the clinic zone as a secondary line).
 */
export function PatientJoinPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = localeForLanguage(i18n.language);
  const deviceTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const [joining, setJoining] = useState(false);

  const client = useMemo(() => new HttpPollingClient(publicBase(token), publicFetcher), [token]);
  const call = useCall({ polite: true, client, join: () => joinAsPatient(token) });

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const i = await getPublicInfo(token);
        if (!live) return;
        setInfo(i);
        setLoadError(false);
        if ("serverNow" in i) setSkew(new Date(i.serverNow).getTime() - Date.now());
      } catch {
        if (live) setLoadError(true);
      }
    };
    void load();
    const id = setInterval(() => void load(), POLL_INFO_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { live = false; clearInterval(id); clearInterval(tick); };
  }, [token]);

  const fmt = (iso: string, tz?: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "full", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso));

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-6" data-testid="th-patient-page">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("telehealth.public.title", "Video visit")}</h1>
        <Button type="button" variant="ghost" size="sm" onClick={() => void i18n.changeLanguage(i18n.language.startsWith("ar") ? "en" : "ar")}>
          <Globe className="me-1.5 h-4 w-4" />{i18n.language.startsWith("ar") ? "English" : "العربية"}
        </Button>
      </header>
      {children}
    </main>
  );
  const message = (icon: React.ReactNode, title: string, body?: string, testId = "th-state") => shell(
    <Card data-testid={testId}><CardContent className="grid gap-2 p-6 text-center">
      <div className="mx-auto text-muted-foreground">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
    </CardContent></Card>,
  );

  if (loadError && !info) return message(<ShieldAlert className="h-8 w-8" />, t("telehealth.public.loadError", "We could not load your visit. Check your connection and try again."));
  if (!info) return message(<Clock3 className="h-8 w-8" />, t("telehealth.public.loading", "Loading…"));
  if (info.state === "INVALID" || info.state === "LINK_REVOKED") {
    return message(<ShieldAlert className="h-8 w-8" />, t("telehealth.public.invalidTitle", "This link is not valid"), t("telehealth.public.invalidBody", "Ask the clinic to send you a new link."), "th-state-invalid");
  }
  const i = info as Extract<PublicInfo, { firstName: string }>;
  if (i.state === "CANCELLED") return message(<VideoOff className="h-8 w-8" />, t("telehealth.public.cancelled", "This visit was cancelled"), t("telehealth.public.cancelledBody", "Contact the clinic if you would like to book again."), "th-state-cancelled");
  if (i.state === "CONVERTED_IN_PERSON") return message(<Hospital className="h-8 w-8" />, t("telehealth.public.inPerson", "This visit was changed to an in-person visit"), t("telehealth.public.inPersonBody", "Please come to {{clinic}} at {{time}}.", { clinic: i.clinicName, time: fmt(i.startsAt, deviceTz) }), "th-state-inperson");
  if (i.state === "EXPIRED") return message(<Clock3 className="h-8 w-8" />, t("telehealth.public.expired", "This visit link has expired"), t("telehealth.public.expiredBody", "The visit window has closed. Contact the clinic."), "th-state-expired");
  if (i.state === "MISSED") return message(<Clock3 className="h-8 w-8" />, t("telehealth.public.missed", "This visit was missed"), t("telehealth.public.missedBody", "Contact the clinic to reschedule."), "th-state-missed");
  if (i.state === "ENDED" || call.phase === "ended") {
    return message(<Hospital className="h-8 w-8" />, t("telehealth.public.ended", "The visit has ended"), t("telehealth.public.endedBody", "Thank you. You can close this page."), "th-state-ended");
  }

  const summary = (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("telehealth.public.hello", "Hello {{name}}", { name: i.firstName })}</CardTitle></CardHeader>
      <CardContent className="grid gap-1.5 text-sm">
        <p>{t("telehealth.public.with", "Video visit with {{doctor}} at {{clinic}}", { doctor: i.doctorName, clinic: i.clinicName })}</p>
        <p className="flex items-center gap-2" data-testid="th-time-device"><CalendarClock className="h-4 w-4" />{fmt(i.startsAt, deviceTz)}<span className="text-muted-foreground">({deviceTz})</span></p>
        {i.clinicTimezone !== deviceTz ? <p className="text-xs text-muted-foreground">{t("telehealth.public.clinicTime", "Clinic time")}: {fmt(i.startsAt, i.clinicTimezone)} ({i.clinicTimezone})</p> : null}
        {i.moved ? <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300" data-testid="th-moved">{t("telehealth.public.moved", "This visit was moved to the time shown above.")}</p> : null}
      </CardContent>
    </Card>
  );

  if (i.state === "TOO_EARLY") {
    const ms = Math.max(0, new Date(i.opensAt).getTime() - (now + skew));
    const mm = Math.floor(ms / 60000);
    const hh = Math.floor(mm / 60);
    const left = hh >= 1 ? `${hh}h ${mm % 60}m` : `${mm}m ${Math.floor((ms % 60000) / 1000)}s`;
    return shell(<>{summary}<Card data-testid="th-state-early"><CardContent className="p-6 text-center"><p className="font-medium">{t("telehealth.public.tooEarly", "The visit room opens 10 minutes before the start time.")}</p><p className="mt-2 text-2xl font-semibold ltr-nums" dir="ltr">{left}</p></CardContent></Card></>);
  }
  if (i.state === "PAYMENT_REQUIRED") {
    return shell(<>{summary}<Card data-testid="th-state-payment"><CardContent className="p-6 text-center"><p className="font-medium">{t("telehealth.public.paymentRequired", "Please complete the prepayment to join. The doctor can already open the room.")}</p></CardContent></Card></>);
  }

  const startCall = async (d: Devices) => {
    setJoining(true);
    await call.start(d);
    setJoining(false);
  };

  if (call.phase === "idle") {
    return shell(<>{summary}<DeviceCheck onJoin={(d) => void startCall(d)} busy={joining} joinLabel={t("telehealth.public.join", "Join video visit")} /></>);
  }
  if (call.phase === "error") {
    const status = (call.error as { status?: number } | null)?.status;
    const code = ((call.error as { body?: { code?: string } } | null)?.body?.code) ?? "";
    return shell(<>{summary}<Card data-testid="th-state-error" role="alert"><CardContent className="grid gap-3 p-6 text-center">
      <p className="font-medium">{status === 402 ? t("telehealth.public.paymentRequired", "Please complete the prepayment to join. The doctor can already open the room.") : code === "TELEHEALTH_TOO_EARLY" ? t("telehealth.public.tooEarly", "The visit room opens 10 minutes before the start time.") : (call.error as DOMException | null)?.name === "NotAllowedError" ? t("telehealth.device.denied", "Camera or microphone access is blocked.") : t("telehealth.public.joinError", "We could not start the visit. Please try again.")}</p>
      <Button type="button" onClick={() => window.location.reload()}>{t("telehealth.device.retry", "Try again")}</Button>
    </CardContent></Card></>);
  }
  return shell(
    <CallView {...call} peerLabel={i.doctorName} />,
  );
}
