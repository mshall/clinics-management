import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Link2, MessageCircle, RefreshCw, Send, Smartphone, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePatientQuery } from "@/lib/api-hooks";
import type { AppointmentDto } from "@/lib/api-types";
import { localeForLanguage } from "@/lib/locale-display";
import { createSession, getSessionByAppointment, regenerateLink, type TelehealthSessionView } from "./telehealth-api";
import { shareMessage, smsShareUrl, whatsappShareUrl } from "./share-link";

const STATUS_LABEL: Record<TelehealthSessionView["status"], [string, string]> = {
  SCHEDULED: ["statusScheduled", "Scheduled"],
  WAITING: ["statusWaiting", "Waiting"],
  ACTIVE: ["statusLive", "Live"],
  ENDED: ["statusEnded", "Ended"],
  CANCELLED: ["statusCancelled", "Cancelled"],
  MISSED: ["statusMissed", "Missed"],
};

export function TelehealthStatusChip({ status }: { status: TelehealthSessionView["status"] }) {
  const { t } = useTranslation();
  const [k, d] = STATUS_LABEL[status];
  const variant = status === "ACTIVE" ? "default" : status === "CANCELLED" || status === "MISSED" ? "muted" : "secondary";
  return <Badge variant={variant} data-testid="th-status-chip" data-status={status}>{t(`telehealth.${k}`, d)}</Badge>;
}

/** Appointment details: status chip, link (Copy / Share / WhatsApp / SMS), "Start video visit" (active 10 min before start), Regenerate link. */
export function TelehealthPanel({ apt }: { apt: AppointmentDto }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const isVideo = apt.serviceLocation === "VIDEO";
  const patient = usePatientQuery(isVideo ? apt.patientId : undefined);
  const q = useQuery({ queryKey: ["telehealth-by-apt", apt.id], enabled: isVideo, queryFn: () => getSessionByAppointment(apt.id).catch(() => createSession(apt.id)), refetchInterval: 20_000 });
  const regen = useMutation({
    mutationFn: () => regenerateLink(q.data!.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telehealth-by-apt", apt.id] }),
  });
  if (!isVideo) return null;
  const s = q.data;
  const lang = localeForLanguage(i18n.language);
  const when = s ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: s.timezone || "Africa/Cairo" }).format(new Date(s.startsAt)) : "";
  const canStart = s && now >= new Date(s.opensAt).getTime() && now <= new Date(s.closesAt).getTime() && s.status !== "CANCELLED" && s.status !== "ENDED";
  const link = s?.joinUrl ?? apt.telehealth?.joinUrl ?? "";
  const msg = s ? shareMessage({ name: apt.patientName ?? "", clinic: apt.clinicNameEn ?? "", when, link, lang: i18n.language.startsWith("ar") ? "ar" : "en" }) : "";
  const phone = (patient.data as { phone?: string | null } | undefined)?.phone ?? null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <Card data-testid="th-panel">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4" />{t("telehealth.panelTitle", "Telehealth visit")}</CardTitle>
        {s ? <TelehealthStatusChip status={s.status} /> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {s && !s.enabled ? <p role="status" className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm" data-testid="th-disabled-banner"><AlertTriangle className="h-4 w-4" />{t("telehealth.disabledBanner", "Telehealth is disabled for your organization. This scheduled visit stays available, but you cannot create new telehealth visits.")}</p> : null}
        {s?.needsStaffReview ? <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm" data-testid="th-review-banner">{t("telehealth.needsReview", "The doctor did not join. This visit needs staff review: the patient was not charged.")}</p> : null}
        {q.isError ? <p className="text-sm text-destructive">{t("telehealth.loadError", "Could not load the telehealth session.")}</p> : null}
        {s ? (
          <>
            <p className="text-sm text-muted-foreground" data-testid="th-when">{when} · {s.timezone || "Africa/Cairo"}</p>
            {link ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs" dir="ltr">
                <Link2 className="h-4 w-4 shrink-0" /><span className="truncate" data-testid="th-link">{link}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {link ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copy()} data-testid="th-copy"><Copy className="me-1.5 h-4 w-4" />{copied ? t("telehealth.copied", "Copied") : t("telehealth.copy", "Copy link")}</Button>
                  {typeof navigator !== "undefined" && "share" in navigator ? <Button type="button" size="sm" variant="outline" onClick={() => void navigator.share({ text: msg, url: link }).catch(() => undefined)}><Send className="me-1.5 h-4 w-4" />{t("telehealth.share", "Share")}</Button> : null}
                  <Button asChild size="sm" variant="outline"><a href={whatsappShareUrl(phone, msg)} target="_blank" rel="noreferrer" data-testid="th-whatsapp"><MessageCircle className="me-1.5 h-4 w-4" />WhatsApp</a></Button>
                  <Button asChild size="sm" variant="outline"><a href={smsShareUrl(phone, msg)} data-testid="th-sms"><Smartphone className="me-1.5 h-4 w-4" />SMS</a></Button>
                </>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={regen.isPending || s.status === "CANCELLED" || s.status === "ENDED"} onClick={() => { if (window.confirm(t("telehealth.regenerateConfirm", "The old link will stop working and the patient will be sent the new one. Continue?"))) regen.mutate(); }} data-testid="th-regenerate"><RefreshCw className="me-1.5 h-4 w-4" />{t("telehealth.regenerate", "Regenerate link")}</Button>
            </div>
            <div>
              {canStart && s.isCurrentClinician ? (
                <Button asChild data-testid="th-start"><Link to={`/telehealth/${s.id}`}><Video className="me-2 h-4 w-4" />{t("telehealth.start", "Start video visit")}</Link></Button>
              ) : (
                <Button type="button" disabled data-testid="th-start" title={s.isCurrentClinician ? t("telehealth.startEarly", "Available 10 minutes before the start time") : t("telehealth.startOnlyDoctor", "Only the assigned doctor can start the visit")}><Video className="me-2 h-4 w-4" />{t("telehealth.start", "Start video visit")}</Button>
              )}
            </div>
          </>
        ) : q.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Small list/calendar badge for VIDEO appointments. */
export function VideoVisitBadge({ serviceLocation }: { serviceLocation?: string | null }) {
  const { t } = useTranslation();
  if (serviceLocation !== "VIDEO") return null;
  return <Badge variant="secondary" className="gap-1 font-normal" data-testid="video-badge"><Video className="h-3 w-3" aria-hidden />{t("telehealth.badge", "Video")}</Badge>;
}
