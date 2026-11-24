import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Circle, Megaphone, MessageCircle, ShieldCheck, Star, Wallet, Video, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import "./kiorex-connect-i18n";
import "./kiorex-door-i18n";
import { doorKey, feeSentence } from "./kiorex-door-hooks";
import type { FrontDoorDto } from "./kiorex-door-types";
import type { ConnectDto } from "./kiorex-connect-types";

const TIMES = ["MORNING", "AFTERNOON", "EVENING", "ANYTIME"] as const;

/** Talk to us: an inline form (no pop-up). Sends a signed lead to Kiorex; needs consent and a phone or e-mail. */
export function TalkToUsForm({ clinicId, already, onDone }: { clinicId: string; already: boolean; onDone: () => void }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const user = useAuthStore((s) => s.user);
  const [f, setF] = useState({ contactName: user?.displayName ?? "", contactRole: "", phone: "", email: user?.email ?? "", preferredTime: "ANYTIME", note: "", consent: false });
  const [err, setErr] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => apiPost<FrontDoorDto>("/api/v1/kiorex/front-door/talk", { clinicId, ...f }),
    onSuccess: (d) => { qc.setQueryData(doorKey(clinicId), d); toast.success(t("kiorexMarketing.form.sent")); onDone(); },
    onError: (e) => { const code = (e as ApiError & { code?: string }).code ?? ""; setErr(t(`kiorexMarketing.errors.${code}`, { defaultValue: t("kiorexMarketing.errors.generic") })); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const noContact = !f.phone.trim() && !f.email.trim();
  return (
    <form className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" data-testid="talk-form" aria-labelledby="talk-h" onSubmit={(e) => { e.preventDefault(); setErr(null); send.mutate(); }}>
      <div><h3 id="talk-h" className="text-lg font-semibold">{t("kiorexMarketing.talkTitle")}</h3><p className="text-sm text-muted-foreground">{t("kiorexMarketing.talkIntro")}</p>{already ? <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400" data-testid="talk-already">{t("kiorexMarketing.form.sentAgain")}</p> : null}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="tk-name">{t("kiorexMarketing.form.name")}</Label><Input id="tk-name" required maxLength={120} autoComplete="name" value={f.contactName} onChange={set("contactName")} data-testid="talk-name" /></div>
        <div className="space-y-1"><Label htmlFor="tk-role">{t("kiorexMarketing.form.role")}</Label><Input id="tk-role" maxLength={80} value={f.contactRole} onChange={set("contactRole")} data-testid="talk-role" /></div>
        <div className="space-y-1"><Label htmlFor="tk-phone">{t("kiorexMarketing.form.phone")}</Label><Input id="tk-phone" type="tel" dir="ltr" maxLength={24} autoComplete="tel" value={f.phone} onChange={set("phone")} aria-describedby="tk-hint" data-testid="talk-phone" /></div>
        <div className="space-y-1"><Label htmlFor="tk-email">{t("kiorexMarketing.form.email")}</Label><Input id="tk-email" type="email" dir="ltr" maxLength={160} autoComplete="email" value={f.email} onChange={set("email")} aria-describedby="tk-hint" data-testid="talk-email" /></div>
        <p id="tk-hint" className="text-xs text-muted-foreground sm:col-span-2">{t("kiorexMarketing.form.contactHint")}</p>
        <div className="space-y-1"><Label htmlFor="tk-time">{t("kiorexMarketing.form.time")}</Label>
          <select id="tk-time" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.preferredTime} onChange={set("preferredTime")} data-testid="talk-time">{TIMES.map((x) => <option key={x} value={x}>{t(`kiorexMarketing.form.times.${x}`)}</option>)}</select></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="tk-note">{t("kiorexMarketing.form.note")}</Label><Textarea id="tk-note" maxLength={500} rows={3} value={f.note} onChange={set("note")} data-testid="talk-note" /></div>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={f.consent} onChange={(e) => setF((x) => ({ ...x, consent: e.target.checked }))} data-testid="talk-consent" />{t("kiorexMarketing.form.consent")}</label>
      {err ? <p role="alert" className="text-sm text-destructive" data-testid="talk-error">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!f.consent || noContact || !f.contactName.trim() || send.isPending} data-testid="talk-send">{t("kiorexMarketing.form.send")}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("kiorexMarketing.form.cancel")}</Button>
      </div>
    </form>
  );
}

const BENEFIT_ICON = { search: Megaphone, deposits: Wallet, reviews: Star, calendar: CalendarCheck, whatsapp: MessageCircle } as const;

/** State 1: standalone and not connected. A calm landing page; every claim is something the product does today. */
export function KiorexLanding({ clinicId, door, connect }: { clinicId: string; door: FrontDoorDto; connect: ConnectDto | undefined }) {
  const { t, i18n } = useTranslation(); const qc = useQueryClient(); const nav = useNavigate();
  const edition = connect?.edition ?? "CLINIC"; const [talking, setTalking] = useState(false);
  const interestSent = useRef(false);
  const start = useMutation({ mutationFn: () => apiPost<FrontDoorDto>("/api/v1/kiorex/front-door/start", { clinicId }), onSuccess: (d) => { qc.setQueryData(doorKey(clinicId), d); nav("/kiorex/connect"); } });
  // privacy-safe funnel marker (organisation id + product only): once per organisation, best effort
  useEffect(() => { if (!interestSent.current && !door.interestedAt) { interestSent.current = true; void apiPost("/api/v1/kiorex/front-door/interest", { clinicId }).catch(() => undefined); } }, [clinicId, door.interestedAt]);
  const required = (connect?.steps ?? []).filter((s) => !s.optional && s.key !== "live");
  const done = required.filter((s) => s.status === "done").length;
  const fee = feeSentence(connect?.feeCard, i18n.language);
  const OptIcon = edition === "NURSE" ? Home : Video;
  const benefits: Array<{ key: string; Icon: typeof Megaphone }> = [{ key: "search", Icon: BENEFIT_ICON.search }, { key: "deposits", Icon: BENEFIT_ICON.deposits }, { key: "reviews", Icon: BENEFIT_ICON.reviews }, { key: "calendar", Icon: BENEFIT_ICON.calendar }, { key: "whatsapp", Icon: BENEFIT_ICON.whatsapp }, { key: `option_${edition}`, Icon: OptIcon }];
  return (
    <div className="space-y-8" data-testid="kiorex-landing">
      <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10" aria-labelledby="kx-hero">
        <h2 id="kx-hero" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("kiorexMarketing.headline")}</h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">{t("kiorexMarketing.intro")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" disabled={start.isPending} onClick={() => start.mutate()} data-testid="landing-start">{t("kiorexMarketing.start")}</Button>
          <Button size="lg" variant="outline" onClick={() => setTalking((x) => !x)} aria-expanded={talking} data-testid="landing-talk">{t("kiorexMarketing.talk")}</Button>
        </div>
        {door.leadAt && !talking ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" data-testid="landing-lead-sent">{t("kiorexMarketing.form.sent")}</p> : null}
      </section>
      {talking ? <TalkToUsForm clinicId={clinicId} already={!!door.leadAt} onDone={() => setTalking(false)} /> : null}

      <section aria-labelledby="kx-benefits">
        <h2 id="kx-benefits" className="mb-3 text-xl font-semibold">{t("kiorexMarketing.benefitsTitle")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ key, Icon }) => (
            <li key={key} className="flex gap-3 rounded-2xl border bg-card p-4" data-testid={`benefit-${key}`}>
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div><h3 className="font-medium">{t(`kiorexMarketing.benefits.${key}.title`)}</h3><p className="text-sm text-muted-foreground">{t(`kiorexMarketing.benefits.${key}.body`)}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kx-how">
        <h2 id="kx-how" className="mb-3 text-xl font-semibold">{t("kiorexMarketing.howTitle")}</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="landing-how">
          {(["prepare", "request", "review", "live"] as const).map((k, i) => (
            <li key={k} className="rounded-2xl border bg-card p-4"><span className="mb-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">{i + 1}</span><h3 className="font-medium">{t(`kiorexMarketing.how.${k}.title`)}</h3><p className="text-sm text-muted-foreground">{t(`kiorexMarketing.how.${k}.body`)}</p></li>
          ))}
        </ol>
      </section>

      {connect && !connect.legacy ? (
        <section aria-labelledby="kx-ready" className="rounded-2xl border bg-card p-4 sm:p-6" data-testid="landing-readiness">
          <h2 id="kx-ready" className="text-xl font-semibold">{t("kiorexMarketing.readinessTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground" data-testid="landing-readiness-count">{t("kiorexMarketing.readinessProgress", { done, total: required.length })}</p>
          <div role="progressbar" aria-valuenow={connect.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("kiorexMarketing.readinessTitle")} className="mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${connect.progress}%` }} /></div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {required.map((s) => (
              <li key={s.key} data-testid={`readiness-${s.key}`} data-status={s.status} className="relative flex items-center gap-2 text-sm">
                {s.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span>{t(`kiorexConnect.step.${s.key}.title`)}</span><span className="sr-only">: {s.status === "done" ? t("kiorexMarketing.readinessDone") : t("kiorexMarketing.readinessMissing")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="kx-reassure" className="rounded-2xl border bg-card p-4 sm:p-6">
          <h2 id="kx-reassure" className="mb-3 flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" />{t("kiorexMarketing.reassureTitle")}</h2>
          <ul className="space-y-2 text-sm" data-testid="landing-reassure">{(["optional", "reversible", "data", "choose"] as const).map((k) => <li key={k} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />{t(`kiorexMarketing.reassure.${k}`)}</li>)}</ul>
        </section>
        <section aria-labelledby="kx-fee" className="rounded-2xl border bg-card p-4 sm:p-6">
          <h2 id="kx-fee" className="mb-3 text-xl font-semibold">{t("kiorexMarketing.feeTitle")}</h2>
          <p className="text-sm" data-testid="landing-fee">{fee ? t("kiorexMarketing.fee", { fee: `⁦${fee}⁩` }) : t("kiorexMarketing.feeUnconfigured")}</p>
        </section>
      </div>
    </div>
  );
}
