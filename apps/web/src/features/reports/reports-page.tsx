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
import { useDateRangeStore } from "@/stores/date-range-store";

/** Demo series for UI-only analytics (not tied to live ledger in this view). */
function buildDemoSeries(months: number) {
  const out: { month: string; visits: number; revenueK: number; newPatients: number }[] = [];
  let v = 420;
  let r = 1180;
  let n = 28;
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString(undefined, { month: "short", year: "2-digit" });
    v = Math.round(v * (1.03 + (i % 3) * 0.01));
    r = Math.round(r * (1.04 + (i % 2) * 0.015));
    n = Math.round(n * (1.02 + (i % 4) * 0.008));
    out.push({ month: label, visits: v, revenueK: r, newPatients: n });
  }
  return out;
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { from, to } = useDateRangeStore();
  const [horizon, setHorizon] = useState(12);
  const chartData = useMemo(() => buildDemoSeries(Math.min(24, Math.max(3, horizon))), [horizon]);

  const moneyK = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", {
      style: "currency",
      currency: "AED",
      maximumFractionDigits: 0,
    }).format(n * 1000);

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
          <CardDescription>{t("reports.growthExplorerHint", "Illustrative monthly trends for executive review.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>{t("reports.months", "Months of history")}</Label>
            <Input
              className="ltr-nums"
              type="number"
              min={3}
              max={24}
              value={horizon}
              onChange={(e) => setHorizon(Number.parseInt(e.target.value || "12", 10) || 12)}
            />
          </div>
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
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => [value, t("reports.visits", "Visits")]}
                  labelFormatter={(l) => String(l)}
                />
                <Legend />
                <Area type="monotone" dataKey="visits" name={t("reports.visits", "Visits")} stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.chartRevenue", "Revenue trajectory (AED thousands)")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [moneyK(value), t("reports.revenue", "Revenue")]} />
                <Legend />
                <Line type="monotone" dataKey="revenueK" name={t("reports.revenueK", "Revenue (k)")} stroke="hsl(142 70% 40%)" strokeWidth={2} dot />
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
              <YAxis tick={{ fontSize: 11 }} />
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
