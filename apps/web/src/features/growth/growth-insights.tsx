import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { usePerformance, useProfilePreview, useRecommendations, useStatement, type GrowthAccess, type OriginStats, type RecommendationDto } from "./growth-api";
import { isKnownRecommendation, lastMonths, pct } from "./growth-logic";

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold ltr-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const ACTION_TARGET: Record<RecommendationDto["action"], (clinicId: string) => string> = {
  availability: (c) => `/clinics/${c}?tab=settings`,
  profile: (c) => `/clinics/${c}?tab=settings`,
  bookings: () => "/appointments",
  links: () => "/kiorex/growth",
  widget: () => "/kiorex/growth?tab=widget",
  page: (c) => `/clinics/${c}?tab=settings`,
  visit_types: (c) => `/clinics/${c}?tab=settings`,
};

export function Recommendations({ clinicId }: { clinicId: string }) {
  const { t } = useTranslation();
  const q = useRecommendations(clinicId);
  const items = (q.data?.items ?? []).filter((r) => isKnownRecommendation(r.id));
  return (
    <Card data-testid="recommendations">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.rec.title")}</CardTitle>
        <CardDescription>{t("growth.rec.guardrail")}</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
        {q.isError ? <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("growth.retry")}</Button>} /> : null}
        {q.isSuccess && items.length === 0 ? <p className="flex items-center gap-2 text-sm" data-testid="rec-empty"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden />{t("growth.rec.allGood")}</p> : null}
        {items.length ? (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3" data-testid={`rec-${r.id}`} data-severity={r.severity}>
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${r.severity === "high" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t(`growth.rec.severity.${r.severity}`)}</p>
                    <p className="text-sm">{t(`growth.rec.items.${r.id}`, r.params)}</p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline"><Link to={ACTION_TARGET[r.action](clinicId)}>{t("growth.rec.open")}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden /></Link></Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OriginCard({ title, hint, s, testId, lang }: { title: string; hint: string; s: OriginStats; testId: string; lang: string }) {
  const { t } = useTranslation();
  const n = (v: number) => v.toLocaleString(localeForLanguage(lang));
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">{t("growth.perf.bookings")}</dt><dd className="text-xl font-semibold ltr-nums" data-testid={`${testId}-bookings`}>{n(s.bookings)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("growth.perf.attended")}</dt><dd className="text-xl font-semibold ltr-nums">{n(s.attended)} <span className="text-xs font-normal text-muted-foreground">{pct(s.attendedRate, lang)}</span></dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("growth.perf.cancelled")}</dt><dd className="ltr-nums">{n(s.cancelledOrNoShow)} <span className="text-xs text-muted-foreground">{pct(s.cancellationRate, lang)}</span></dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("growth.perf.newPatients")}</dt><dd className="ltr-nums">{n(s.newPatients)}</dd></div>
      </dl>
    </div>
  );
}

export function PerformanceSection({ clinicId, access }: { clinicId: string; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = localeForLanguage(lang);
  const ranges = [30, 90, 180, 365].filter((d) => d <= access.plan.trendDays);
  const [days, setDays] = useState(ranges.includes(90) ? 90 : ranges[ranges.length - 1] ?? 30);
  const q = usePerformance(clinicId, days);
  const p = q.data;
  const total = (p?.providerOriginated.bookings ?? 0) + (p?.marketplaceOriginated.bookings ?? 0);
  const money = (v: number) => formatMoneyAmount(v, p?.commission.currency ?? "EGP", locale);
  const data = (p?.trend ?? []).map((w) => ({ ...w, label: t("growth.perf.week", { date: new Date(`${w.week}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) }) }));

  return (
    <Card data-testid="performance-section">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t("growth.perf.title")}</CardTitle>
          <CardDescription>{t("growth.perf.hint")}</CardDescription>
        </div>
        <div className="space-y-1">
          <Label htmlFor="perf-range">{t("growth.perf.range")}</Label>
          <select id="perf-range" className="native-select h-10" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="perf-range">
            {ranges.map((d) => <option key={d} value={d}>{t("growth.perf.days", { days: d })}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
        {q.isError ? <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("growth.retry")}</Button>} /> : null}
        {p && total === 0 && p.links.visits === 0 ? <EmptyState compact title={t("growth.perf.empty")} description={t("growth.perf.emptyHint")} /> : null}
        {p && (total > 0 || p.links.visits > 0) ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <OriginCard title={t("growth.perf.provider")} hint={t("growth.perf.providerHint")} s={p.providerOriginated} testId="perf-provider" lang={lang} />
              <OriginCard title={t("growth.perf.marketplace")} hint={t("growth.perf.marketplaceHint")} s={p.marketplaceOriginated} testId="perf-marketplace" lang={lang} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label={t("growth.perf.visits")} value={p.links.visits.toLocaleString(locale)} testId="tile-visits" />
              <Tile label={t("growth.perf.visitToBooking")} value={pct(p.links.visitToBooking, lang)} testId="tile-conv" />
              <Tile label={t("growth.perf.bookingToAttended")} value={pct(p.links.bookingToAttended, lang)} />
              <Tile label={t("growth.perf.incremental")} value={money(p.incrementalMarketplaceRevenue)} hint={t("growth.perf.incrementalHint")} testId="tile-incremental" />
              <Tile label={t("growth.perf.commission")} value={money(p.commission.total)} hint={t("growth.perf.commissionHint")} testId="tile-commission" />
              <Tile label={t("growth.perf.net")} value={money(p.commission.incrementalRevenueNet)} testId="tile-net" />
            </div>
            <figure className="space-y-2" data-testid="trend">
              <figcaption className="text-sm font-semibold">{t("growth.perf.trend")}</figcaption>
              <div className="h-64 w-full" role="img" aria-label={t("growth.perf.trendAlt")}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #ddd)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} reversed={lang.startsWith("ar")} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} orientation={lang.startsWith("ar") ? "right" : "left"} width={32} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="provider" name={t("growth.perf.provider")} stackId="a" fill="var(--kx-product-clinic, #0D9488)" />
                    <Bar dataKey="marketplace" name={t("growth.perf.marketplace")} stackId="a" fill="var(--kx-ocean-700, #0369A1)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only" data-testid="trend-table">
                <caption>{t("growth.perf.trendAlt")}</caption>
                <thead><tr><th scope="col" /><th scope="col">{t("growth.perf.provider")}</th><th scope="col">{t("growth.perf.marketplace")}</th></tr></thead>
                <tbody>{data.map((d) => <tr key={d.week}><th scope="row">{d.label}</th><td>{d.provider}</td><td>{d.marketplace}</td></tr>)}</tbody>
              </table>
            </figure>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatementSection({ clinicId }: { clinicId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = localeForLanguage(lang);
  const months = lastMonths(6);
  const [period, setPeriod] = useState(months[0]!);
  const q = useStatement(clinicId, period);
  const s = q.data;
  const money = (v: string) => formatMoneyAmount(Number(v), s?.currency ?? "EGP", locale);
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <Card data-testid="statement-section">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t("growth.statement.title")}</CardTitle>
          <CardDescription>{t("growth.statement.hint")}</CardDescription>
        </div>
        <div className="space-y-1">
          <Label htmlFor="statement-month">{t("growth.statement.month")}</Label>
          <select id="statement-month" className="native-select h-10" value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="statement-month">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
        {q.isError ? <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("growth.retry")}</Button>} /> : null}
        {s ? (
          <>
            <p role="status" className={`rounded-lg border p-3 text-sm ${s.reconciled ? "" : "border-destructive"}`} data-testid="statement-verdict" data-reconciled={String(s.reconciled)}>
              {s.reconciled ? t("growth.statement.reconciled") : t("growth.statement.notReconciled", { count: s.mismatches.length })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label={t("growth.statement.expected")} value={money(s.totals.expectedFromDecisions)} testId="st-expected" />
              <Tile label={t("growth.statement.active")} value={money(s.totals.activeCharges)} testId="st-active" />
              <Tile label={t("growth.statement.reversed")} value={money(s.totals.reversedOrWaived)} />
              <Tile label={t("growth.statement.providerLed")} value={s.providerLedBookings.toLocaleString(locale)} testId="st-provider-led" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <section aria-labelledby="st-dec">
                <h3 id="st-dec" className="mb-1 text-sm font-semibold">{t("growth.statement.decisions")}</h3>
                <ul className="text-sm">
                  {(["CHARGE", "NO_CHARGE", "WAIVED"] as const).map((k) => <li key={k} className="flex justify-between border-b py-1"><span>{t(`growth.statement.${k}`)}</span><span className="ltr-nums">{(s.byDecision[k] ?? 0).toLocaleString(locale)}</span></li>)}
                </ul>
              </section>
              <section aria-labelledby="st-why">
                <h3 id="st-why" className="mb-1 text-sm font-semibold">{t("growth.statement.reasons")}</h3>
                <ul className="text-sm" data-testid="st-reasons">
                  {Object.entries(s.noChargeReasons).map(([k, v]) => <li key={k} className="flex justify-between border-b py-1"><span>{t(`growth.statement.reason.${k}`, k)}</span><span className="ltr-nums">{v.toLocaleString(locale)}</span></li>)}
                </ul>
              </section>
            </div>
            {s.mismatches.length ? (
              <section aria-labelledby="st-mm" data-testid="st-mismatches">
                <h3 id="st-mm" className="mb-1 text-sm font-semibold">{t("growth.statement.mismatches")}</h3>
                <ul className="space-y-1 text-sm">
                  {s.mismatches.map((m) => <li key={m.appointmentId} className="rounded-md border p-2">{t(`growth.statement.mismatch.${m.kind}`, m.kind)} · {t("growth.statement.expectedAmount")} {money(m.expected)} · {t("growth.statement.actualAmount")} {money(m.actual)}</li>)}
                </ul>
              </section>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("growth.statement.dispute")}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProfilePreviewCard({ clinicId }: { clinicId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const q = useProfilePreview(clinicId);
  const p = q.data;
  return (
    <Card data-testid="profile-preview">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.profile.title")}</CardTitle>
        <CardDescription>{t("growth.profile.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
        {q.isError ? <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("growth.retry")}</Button>} /> : null}
        {p ? (
          <>
            <p className="text-sm font-medium" data-testid="profile-ready" data-ready={String(p.ready)}>{p.ready ? t("growth.profile.ready") : t("growth.profile.notReady")}</p>
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">{t("growth.profile.doctors")}</h3>
              {p.doctors.length ? (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {p.doctors.map((d) => <li key={d.clinicianId}>{isAr ? d.nameAr : d.nameEn}{(isAr ? d.titleAr : d.titleEn) ? <span className="text-muted-foreground"> · {isAr ? d.titleAr : d.titleEn}</span> : null}</li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t("growth.profile.noDoctors")}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{t("growth.profile.types", { count: p.bookableVisitTypes })}</p>
            </div>
            {p.pageUrl ? <Button asChild variant="outline" size="sm"><a href={p.pageUrl} target="_blank" rel="noreferrer" data-testid="profile-open">{t("growth.profile.open")}<ExternalLink className="size-4" aria-hidden /></a></Button> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
