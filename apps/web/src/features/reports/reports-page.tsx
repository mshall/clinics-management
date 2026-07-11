import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AcquisitionChannelPatientsDialog } from "@/components/acquisition-channel-patients-dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReportsMonthlySeriesQuery, useReportsPatientAcquisitionQuery } from "@/lib/api-hooks";
import { useDateRangeStore } from "@/stores/date-range-store";
import { localeForLanguage } from "@/lib/locale-display";
import {
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";

const ACQUISITION_CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 70% 40%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 55%)",
  "hsl(0 72% 51%)",
  "hsl(174 60% 40%)",
  "hsl(215 20% 55%)",
];

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { from, to } = useDateRangeStore();
  const [horizon, setHorizon] = useState(12);
  const [selectedChannel, setSelectedChannel] = useState<{ channel: string; label: string } | null>(null);
  const series = useReportsMonthlySeriesQuery(horizon);
  const acquisition = useReportsPatientAcquisitionQuery(from, to);
  const chartData = useMemo(() => series.data?.items ?? [], [series.data?.items]);

  const acquisitionChartData = useMemo(() => {
    return (acquisition.data?.items ?? []).map((item) => ({
      channel: item.channel,
      count: item.count,
      sharePercent: item.sharePercent,
      label:
        item.channel === "UNKNOWN"
          ? t("reports.acquisitionUnknown", "Not specified")
          : patientAcquisitionLabel(item.channel as PatientAcquisitionChannel, t),
    }));
  }, [acquisition.data?.items, t]);

  const acquisitionTotal = acquisition.data?.total ?? 0;

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), {
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.acquisitionTitle", "How patients found us")}</CardTitle>
          <CardDescription>
            {t(
              "reports.acquisitionHint",
              "Registration acquisition channels for new patients in the selected date range ({{from}} → {{to}}).",
              { from, to },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {acquisition.isError ? (
            <p className="text-sm text-destructive">
              {acquisition.error instanceof Error ? acquisition.error.message : t("common.error")}
            </p>
          ) : acquisition.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : acquisitionTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("reports.acquisitionEmpty", "No patient registrations in this period.")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground ltr-nums">
                {t("reports.acquisitionTotal", "{{count}} registrations in range", {
                  count: acquisitionTotal,
                })}
              </p>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={acquisitionChartData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        label={({ label, percent }) =>
                          `${label ?? ""} (${typeof percent === "number" ? Math.round(percent * 100) : 0}%)`
                        }
                        labelLine={false}
                      >
                        {acquisitionChartData.map((_, index) => (
                          <Cell key={index} fill={ACQUISITION_CHART_COLORS[index % ACQUISITION_CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, _name, item) => [
                          value,
                          (item as { payload?: { label?: string } })?.payload?.label ?? "",
                        ]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={acquisitionChartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number) => [value, t("reports.newPatients", "New patients")]} />
                      <Bar dataKey="count" name={t("reports.newPatients", "New patients")} radius={[0, 4, 4, 0]}>
                        {acquisitionChartData.map((_, index) => (
                          <Cell key={index} fill={ACQUISITION_CHART_COLORS[index % ACQUISITION_CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("reports.acquisitionRowHint", "Click a channel row to view patients.")}</p>
              <ResponsiveTable className="rounded-md border">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">{t("reports.acquisitionChannel", "Channel")}</th>
                      <th className="px-3 py-2 font-medium ltr-nums">{t("reports.acquisitionCount", "Patients")}</th>
                      <th className="px-3 py-2 font-medium ltr-nums">{t("reports.acquisitionShare", "Share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acquisitionChartData.map((row) => (
                      <tr
                        key={row.channel}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-t transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                        onClick={() => setSelectedChannel({ channel: row.channel, label: row.label })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedChannel({ channel: row.channel, label: row.label });
                          }
                        }}
                      >
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 ltr-nums">{row.count}</td>
                        <td className="px-3 py-2 ltr-nums">{row.sharePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </>
          )}
        </CardContent>
      </Card>

      <AcquisitionChannelPatientsDialog
        open={selectedChannel != null}
        onOpenChange={(open) => {
          if (!open) setSelectedChannel(null);
        }}
        channel={selectedChannel?.channel ?? ""}
        channelLabel={selectedChannel?.label ?? ""}
        from={from}
        to={to}
      />
    </div>
  );
}
