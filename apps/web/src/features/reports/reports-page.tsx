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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useClinicsQuery,
  useReportsClinicBreakdownQuery,
  useReportsMonthlySeriesQuery,
  useReportsPatientAcquisitionQuery,
  useReportsPerformanceQuery,
} from "@/lib/api-hooks";
import type { ReportsMonthlySeriesItemDto } from "@/lib/api-types";
import { formatClinicName, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import {
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { useAuthStore } from "@/stores/auth-store";
import { useDateRangeStore } from "@/stores/date-range-store";

const ACQUISITION_CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 70% 40%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 55%)",
  "hsl(0 72% 51%)",
  "hsl(174 60% 40%)",
  "hsl(215 20% 55%)",
];

const CURRENCY_SERIES_COLORS = [
  { revenue: "hsl(200 85% 32%)", expense: "hsl(200 55% 48%)" },
  { revenue: "hsl(142 70% 40%)", expense: "hsl(142 45% 52%)" },
  { revenue: "hsl(38 92% 45%)", expense: "hsl(38 70% 55%)" },
  { revenue: "hsl(280 65% 50%)", expense: "hsl(280 45% 58%)" },
  { revenue: "hsl(0 72% 48%)", expense: "hsl(0 50% 58%)" },
];

function currencyColors(index: number) {
  return CURRENCY_SERIES_COLORS[index % CURRENCY_SERIES_COLORS.length]!;
}

function amountForCurrency(rows: { currency: string; amount: number }[], currency: string): number {
  return rows.find((r) => r.currency === currency)?.amount ?? 0;
}

function buildCurrencyChartRows(items: ReportsMonthlySeriesItemDto[], currencies: string[]) {
  return items.map((item) => {
    const row: Record<string, string | number> = {
      month: item.month,
      visits: item.visits,
      newPatients: item.newPatients,
    };
    for (const currency of currencies) {
      row[`revenue_${currency}`] = amountForCurrency(item.revenueByCurrency, currency);
      row[`expenses_${currency}`] = amountForCurrency(item.expensesByCurrency, currency);
    }
    return row;
  });
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const loc = localeForLanguage(i18n.language);
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
  const { from, to } = useDateRangeStore();
  const [horizon, setHorizon] = useState(12);
  const [scopeClinicId, setScopeClinicId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<{ channel: string; label: string } | null>(null);

  const { data: clinics = [] } = useClinicsQuery();
  const clinicScopeId = scopeClinicId.trim() || undefined;

  const series = useReportsMonthlySeriesQuery(horizon, clinicScopeId);
  const performance = useReportsPerformanceQuery(from, to, clinicScopeId);
  const clinicBreakdown = useReportsClinicBreakdownQuery(from, to, !isPhysician && !clinicScopeId);
  const acquisition = useReportsPatientAcquisitionQuery(from, to);

  const currencies = series.data?.currencies ?? performance.data?.byCurrency.map((r) => r.currency) ?? [];
  const chartData = useMemo(
    () => buildCurrencyChartRows(series.data?.items ?? [], currencies),
    [series.data?.items, currencies],
  );

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
  const scopeLabel =
    clinicScopeId != null && clinicScopeId !== ""
      ? formatClinicName(
          clinics.find((c) => c.id === clinicScopeId) ?? { nameEn: clinicScopeId, nameAr: clinicScopeId },
          i18n.language,
        )
      : t("reports.scopeOrganization", "Organization (all clinics)");

  const money = (n: number, currency: string) => formatMoneyAmount(n, currency, loc);

  const performanceByCurrency = performance.data?.byCurrency ?? [];
  const breakdownItems = clinicBreakdown.data?.items ?? [];

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
          <CardTitle className="text-base">{t("reports.scopeTitle", "Report scope")}</CardTitle>
          <CardDescription>
            {t(
              "reports.scopeHint",
              "View organization-wide performance or focus on a single clinic. Financial charts respect each clinic's currency settings.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="reports-scope">{t("reports.scopeClinic", "Clinic")}</Label>
            <select
              id="reports-scope"
              className={nativeSelectClassName}
              value={scopeClinicId}
              onChange={(e) => setScopeClinicId(e.target.value)}
            >
              <option value="">{t("reports.scopeAllClinics", "All clinics (organization)")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatClinicName(c, i18n.language)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end text-sm text-muted-foreground sm:col-span-2">
            <span>
              {t("reports.scopeCurrent", "Showing")}: <strong className="text-foreground">{scopeLabel}</strong>
            </span>
            {performance.data?.baseCurrency ? (
              <span className="text-xs">
                {t("reports.orgBaseCurrency", "Organization base currency")}: {performance.data.baseCurrency}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.performanceTitle", "Performance summary")}</CardTitle>
          <CardDescription>
            {t("reports.performanceHint", "Key metrics for {{scope}} in the selected date range.", { scope: scopeLabel })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {performance.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : performance.isError ? (
            <p className="text-sm text-destructive">
              {performance.error instanceof Error ? performance.error.message : t("common.error")}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("reports.visits", "Visits")}</p>
                  <p className="text-2xl font-semibold ltr-nums">{performance.data?.visits ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("reports.newPatients", "New patients")}
                  </p>
                  <p className="text-2xl font-semibold ltr-nums">{performance.data?.newPatients ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("reports.appointmentsCompleted", "Appointments completed")}
                  </p>
                  <p className="text-2xl font-semibold ltr-nums">{performance.data?.appointmentsCompleted ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("reports.currenciesActive", "Currencies in period")}
                  </p>
                  <p className="text-2xl font-semibold ltr-nums">{performanceByCurrency.length}</p>
                </div>
              </div>

              {performanceByCurrency.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("reports.noFinancialActivity", "No revenue or expenses in this period.")}</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {performanceByCurrency.map((row) => (
                    <div key={row.currency} className="rounded-lg border px-4 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Badge variant="secondary">{row.currency}</Badge>
                        <span className="text-sm font-medium">{t("reports.plTitle", "Profit & loss")}</span>
                      </div>
                      <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground">{t("reports.revenue", "Revenue")}</dt>
                          <dd className="font-semibold ltr-nums">{money(row.revenue, row.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t("reports.expenses", "Expenses")}</dt>
                          <dd className="font-semibold ltr-nums">{money(row.expenses, row.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t("reports.netProfit", "Net profit")}</dt>
                          <dd className={`font-semibold ltr-nums ${row.netProfit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
                            {money(row.netProfit, row.currency)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!isPhysician && !clinicScopeId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.clinicBreakdownTitle", "Breakdown by clinic")}</CardTitle>
            <CardDescription>
              {t(
                "reports.clinicBreakdownHint",
                "Revenue, expenses, and operational metrics for each clinic in the organization for {{from}} → {{to}}.",
                { from, to },
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clinicBreakdown.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
            ) : clinicBreakdown.isError ? (
              <p className="text-sm text-destructive">
                {clinicBreakdown.error instanceof Error ? clinicBreakdown.error.message : t("common.error")}
              </p>
            ) : (
              <ResponsiveTable className="rounded-md border">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">{t("reports.clinicColumn", "Clinic")}</th>
                      <th className="px-3 py-2 font-medium ltr-nums">{t("reports.visits", "Visits")}</th>
                      <th className="px-3 py-2 font-medium ltr-nums">{t("reports.newPatients", "New patients")}</th>
                      <th className="px-3 py-2 font-medium">{t("reports.financialByCurrency", "Financials by currency")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((row) => (
                      <tr key={row.clinicId} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">
                            {formatClinicName(
                              { nameEn: row.clinicNameEn, nameAr: row.clinicNameAr },
                              i18n.language,
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("reports.defaultCurrency", "Default")}: {row.defaultCurrency}
                          </p>
                        </td>
                        <td className="px-3 py-3 ltr-nums">{row.visits}</td>
                        <td className="px-3 py-3 ltr-nums">{row.newPatients}</td>
                        <td className="px-3 py-3">
                          {row.byCurrency.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <ul className="space-y-2">
                              {row.byCurrency.map((c) => (
                                <li key={c.currency} className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs">
                                  <div className="mb-1 font-medium">{c.currency}</div>
                                  <div className="grid grid-cols-3 gap-2 ltr-nums">
                                    <span>{t("reports.revenue", "Revenue")}: {money(c.revenue, c.currency)}</span>
                                    <span>{t("reports.expenses", "Expenses")}: {money(c.expenses, c.currency)}</span>
                                    <span className={c.netProfit < 0 ? "text-destructive" : ""}>
                                      {t("reports.netProfit", "Net")}: {money(c.netProfit, c.currency)}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.growthExplorer", "Growth explorer")}</CardTitle>
          <CardDescription>
            {t(
              "reports.growthExplorerHintLive",
              "Monthly series from finalized encounters, posted revenue, and patient registrations in your organization.",
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("nav.revenue")} vs {t("nav.expenses")}
            {currencies.length === 1 ? ` (${currencies[0]})` : currencies.length > 1 ? t("reports.multiCurrency", " · multi-currency") : ""}
          </CardTitle>
          <CardDescription>
            {t(
              "reports.revenueVsExpensesHint",
              "Monthly posted revenue and approved/pending expenses. Amounts are grouped by currency — no FX conversion.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-96">
          {series.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : currencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noFinancialActivity", "No revenue or expenses in this period.")}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={88} tickFormatter={(v) => String(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const currency = name.split("_").pop() ?? series.data?.baseCurrency ?? "AED";
                    const kind = name.startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses");
                    return [money(Number(value), currency), `${kind} (${currency})`];
                  }}
                />
                <Legend />
                {currencies.map((currency, index) => {
                  const colors = currencyColors(index);
                  return (
                    <Area
                      key={`rev-${currency}`}
                      type="monotone"
                      dataKey={`revenue_${currency}`}
                      name={`revenue_${currency}`}
                      stroke={colors.revenue}
                      fill={colors.revenue}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      stackId={`rev-${currency}`}
                    />
                  );
                })}
                {currencies.map((currency, index) => {
                  const colors = currencyColors(index);
                  return (
                    <Area
                      key={`exp-${currency}`}
                      type="monotone"
                      dataKey={`expenses_${currency}`}
                      name={`expenses_${currency}`}
                      stroke={colors.expense}
                      fill={colors.expense}
                      fillOpacity={0.15}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      stackId={`exp-${currency}`}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {currencies.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {currencies.map((currency, index) => {
            const colors = currencyColors(index);
            return (
              <Card key={currency}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("reports.chartRevenueByCurrency", "Revenue vs expenses ({{currency}})", { currency })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => money(Number(v), currency)} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          money(Number(value), currency),
                          name.startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses"),
                        ]}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey={`revenue_${currency}`}
                        name={t("nav.revenue")}
                        stroke={colors.revenue}
                        fill={colors.revenue}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey={`expenses_${currency}`}
                        name={t("nav.expenses")}
                        stroke={colors.expense}
                        fill={colors.expense}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

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
            <CardTitle className="text-base">
              {currencies.length === 1
                ? t("reports.chartRevenueCurrency", "Posted revenue ({{currency}})", { currency: currencies[0] })
                : t("reports.chartRevenueMulti", "Posted revenue by currency")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => String(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const currency = String(name).replace(/^revenue_/, "");
                    return [money(Number(value), currency), currency];
                  }}
                />
                <Legend />
                {currencies.map((currency, index) => (
                  <Line
                    key={currency}
                    type="monotone"
                    dataKey={`revenue_${currency}`}
                    name={`revenue_${currency}`}
                    stroke={currencyColors(index).revenue}
                    strokeWidth={2}
                    dot
                  />
                ))}
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
