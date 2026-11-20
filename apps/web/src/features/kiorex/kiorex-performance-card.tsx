import { EmptyState } from "@/brand/ui-kit";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import type { KiorexOverviewDto } from "./kiorex-types";

function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-md border px-3 py-2" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold ltr-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function KiorexPerformanceCard({ clinicId }: { clinicId: string }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const isAr = i18n.language.startsWith("ar");
  const months = useMemo(() => lastMonths(6), []);
  const [period, setPeriod] = useState(months[0]!);

  const q = useQuery({
    queryKey: ["kiorex", "overview", clinicId, period],
    queryFn: () =>
      apiGet<KiorexOverviewDto>(
        `/api/v1/kiorex/overview?clinicId=${encodeURIComponent(clinicId)}&period=${encodeURIComponent(period)}`,
      ),
    enabled: Boolean(clinicId),
  });
  const o = q.data;
  const n = (v: number) => v.toLocaleString(locale);
  const money = (v: number) => formatMoneyAmount(v, o?.currency ?? "", locale);
  const monthLabel = (key: string) =>
    new Date(`${key}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  const chartData = useMemo(
    () => (o?.daily ?? []).map((d) => ({ ...d, label: String(Number(d.date.slice(8, 10))) })),
    [o?.daily],
  );

  return (
    <Card data-testid="kiorex-performance-card">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t("kiorexTab.performance.title", "Performance")}</CardTitle>
          <CardDescription>
            {t("kiorexTab.performance.hint", "What Kiorex brought this branch in the selected month.")}
          </CardDescription>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kiorex-period">{t("kiorexTab.performance.period", "Month")}</Label>
          <select
            id="kiorex-period"
            className="native-select h-10 min-h-10"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {q.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
        {q.isError ? (
          <p className="text-sm text-destructive">{t("kiorexTab.performance.loadError", "Could not load Kiorex performance.")}</p>
        ) : null}
        {o ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label={t("kiorexTab.performance.views", "Profile views")} value={n(o.profileViews)} testId="kiorex-kpi-views" />
              <Tile
                label={t("kiorexTab.performance.bookings", "Bookings")}
                value={n(o.bookings)}
                hint={t("kiorexTab.performance.byChannel", {
                  defaultValue: "Kiorex {{marketplace}} · WhatsApp {{whatsapp}} · Your link {{clinicLink}}",
                  marketplace: n(o.bookingsByChannel.marketplace),
                  whatsapp: n(o.bookingsByChannel.whatsapp),
                  clinicLink: n(o.bookingsByChannel.clinicLink),
                })}
                testId="kiorex-kpi-bookings"
              />
              <Tile label={t("kiorexTab.performance.attended", "Attended")} value={n(o.attended)} testId="kiorex-kpi-attended" />
              <Tile label={t("kiorexTab.performance.noShows", "No-shows")} value={n(o.noShows)} />
              <Tile label={t("kiorexTab.performance.newPatients", "New patients")} value={n(o.newPatients)} />
              <Tile
                label={t("kiorexTab.performance.commission", "Kiorex commission")}
                value={money(o.commission.amount)}
                hint={t("kiorexTab.performance.commissionSplit", {
                  defaultValue: "{{confirmed}} confirmed · {{pending}} pending",
                  confirmed: money(o.commission.confirmed),
                  pending: money(o.commission.pending),
                })}
                testId="kiorex-kpi-commission"
              />
              <Tile
                label={t("kiorexTab.performance.creditOffset", "Offset against subscription")}
                value={o.creditOffset == null ? "—" : money(o.creditOffset)}
                hint={t("kiorexTab.performance.allBranches", "All branches")}
              />
              <Tile
                label={t("kiorexTab.performance.rating", "Kiorex rating")}
                value={o.rating.averageRating == null ? "—" : o.rating.averageRating.toFixed(1)}
                hint={t("kiorexTab.ratings.count", { defaultValue: "{{count}} reviews", count: o.rating.reviewCount })}
              />
            </div>

            {o.freeProgress ? (
              <div className="space-y-1" data-testid="kiorex-free-progress">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {o.freeProgress.isFreeThisMonth
                      ? t("kiorexTab.performance.freeReached", "Kiorly is free this month")
                      : t("kiorexTab.performance.freeProgress", {
                          defaultValue: "{{count}} more Kiorex patients and Kiorly is free this month",
                          count: o.freeProgress.patientsStillNeeded,
                        })}
                  </span>
                  <span className="text-muted-foreground ltr-nums">
                    {n(o.freeProgress.patientsAttended)} / {n(o.freeProgress.patientsTarget)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("kiorexTab.performance.freeProgress", "Progress to free month")} aria-valuenow={o.freeProgress.progressPercent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, o.freeProgress.progressPercent)}%` }} />
                </div>
              </div>
            ) : null}

            {chartData.every((d) => !d.bookings && !d.attended && !d.views) ? (
              <EmptyState compact title={t("kiorexTab.performance.noActivity", "No Kiorex activity yet this month")} description={t("kiorexTab.performance.noActivityHint", "Profile views and bookings from Kiorex will chart here as they arrive.")} />
            ) : (
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" reversed={isAr} />
                  <YAxis yAxisId="count" tick={{ fontSize: 11 }} allowDecimals={false} width={32} orientation={isAr ? "right" : "left"} />
                  <YAxis yAxisId="views" tick={{ fontSize: 11 }} allowDecimals={false} width={40} orientation={isAr ? "left" : "right"} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="count" dataKey="bookings" name={t("kiorexTab.performance.bookings", "Bookings")} fill="var(--kx-chart-2)" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="count" dataKey="attended" name={t("kiorexTab.performance.attended", "Attended")} fill="var(--kx-chart-1)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="views" type="monotone" dataKey="views" name={t("kiorexTab.performance.views", "Profile views")} stroke="var(--kx-chart-3)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
