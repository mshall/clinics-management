import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReportsMonthlySeriesQuery } from "@/lib/api-hooks";
import { useDateRangeStore } from "@/stores/date-range-store";

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { from, to } = useDateRangeStore();
  const [horizon, setHorizon] = useState(12);
  const series = useReportsMonthlySeriesQuery(horizon);
  const chartData = useMemo(() => series.data?.items ?? [], [series.data?.items]);

  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", {
      style: "currency",
      currency: "AED",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground">{t("reports.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground ltr-nums">
          {t("reports.usingRange")}: {from} → {to}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.growthExplorer", "Growth explorer")}</CardTitle>
          <CardDescription>
            {t(
              "reports.growthExplorerHintLive",
              "Monthly series from finalized encounters, posted revenue, and patient registrations in your organization."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>{t("reports.months", "Months of history")}</Label>
            <Input
              className="ltr-nums"
              type="number"
              min={3}
              max={36}
              value={horizon}
              onChange={(e) => setHorizon(Number.parseInt(e.target.value || "12", 10) || 12)}
            />
          </div>
          {series.isError ? (
            <p className="text-sm text-destructive">
              {series.error instanceof Error ? series.error.message : t("common.error")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.chartVisits", "Visit volume")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(value: number) => [value, t("reports.visits", "Visits")]} labelFormatter={(l) => String(l)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="visits"
                  name={t("reports.visits", "Visits")}
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.25)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.chartRevenue", "Posted revenue (AED)")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={72} />
                <Tooltip formatter={(value: number) => [money(Number(value)), t("reports.revenue", "Revenue")]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={t("reports.revenue", "Revenue")}
                  stroke="hsl(142 70% 40%)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.chartNewPatients", "New patient intake")}</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(value: number) => [value, t("reports.newPatients", "New patients")]} />
              <Legend />
              <Bar dataKey="newPatients" name={t("reports.newPatients", "New patients")} fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
