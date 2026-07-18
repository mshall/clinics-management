import { useMemo, useState, type ReactNode } from "react";
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
import { ResponsiveTable, ResponsiveTableElement } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  useClinicsQuery,
  useReportsClinicBreakdownQuery,
  useReportsMonthlySeriesQuery,
  useReportsPatientAcquisitionQuery,
  useReportsPerformanceQuery,
} from "@/lib/api-hooks";
import type { ReportsClinicBreakdownItemDto, ReportsCurrencyTotalsDto, ReportsMonthlySeriesItemDto } from "@/lib/api-types";
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

const REVENUE_CHART_COLOR = "hsl(221 83% 53%)";
const EXPENSE_CHART_COLOR = "hsl(215 14% 52%)";

const REVENUE_TEXT_CLASS = "font-semibold text-sky-700 dark:text-sky-400";
const EXPENSE_TEXT_CLASS = "font-semibold text-muted-foreground";

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

type ClinicBreakdownRow = {
  key: string;
  clinic: ReportsClinicBreakdownItemDto;
  currencyRow: ReportsCurrencyTotalsDto | null;
  showClinicMeta: boolean;
  clinicRowSpan: number;
};

function buildClinicBreakdownRows(items: ReportsClinicBreakdownItemDto[]): ClinicBreakdownRow[] {
  const rows: ClinicBreakdownRow[] = [];
  for (const clinic of items) {
    if (clinic.byCurrency.length === 0) {
      rows.push({
        key: `${clinic.clinicId}-none`,
        clinic,
        currencyRow: null,
        showClinicMeta: true,
        clinicRowSpan: 1,
      });
      continue;
    }
    clinic.byCurrency.forEach((currencyRow, index) => {
      rows.push({
        key: `${clinic.clinicId}-${currencyRow.currency}`,
        clinic,
        currencyRow,
        showClinicMeta: index === 0,
        clinicRowSpan: clinic.byCurrency.length,
      });
    });
  }
  return rows;
}

function ChartFrame({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ?? "h-56 w-full sm:h-72 lg:h-96"}>{children}</div>;
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const loc = localeForLanguage(i18n.language);
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
  const { from, to } = useDateRangeStore();
  const [scopeClinicId, setScopeClinicId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<{ channel: string; label: string } | null>(null);

  const { data: clinics = [] } = useClinicsQuery();
  const clinicScopeId = scopeClinicId.trim() || undefined;

  const series = useReportsMonthlySeriesQuery(from, to, clinicScopeId);
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
  const clinicBreakdownRows = useMemo(() => buildClinicBreakdownRows(breakdownItems), [breakdownItems]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("reports.title")}</h1>
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
                      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-muted-foreground">{t("reports.revenue", "Revenue")}</dt>
                          <dd className={`ltr-nums tabular-nums ${REVENUE_TEXT_CLASS}`}>{money(row.revenue, row.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t("reports.expenses", "Expenses")}</dt>
                          <dd className={`ltr-nums tabular-nums ${EXPENSE_TEXT_CLASS}`}>{money(row.expenses, row.currency)}</dd>
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
              <>
                <div className="space-y-3 sm:hidden">
                  {breakdownItems.map((row) => (
                    <div key={row.clinicId} className="rounded-lg border bg-card p-3">
                      <p className="font-medium">
                        {formatClinicName({ nameEn: row.clinicNameEn, nameAr: row.clinicNameAr }, i18n.language)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("reports.defaultCurrency", "Default")}: {row.defaultCurrency}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("reports.visits", "Visits")}</p>
                          <p className="font-medium ltr-nums tabular-nums">{row.visits}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("reports.newPatients", "New patients")}</p>
                          <p className="font-medium ltr-nums tabular-nums">{row.newPatients}</p>
                        </div>
                      </div>
                      {row.byCurrency.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">—</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {row.byCurrency.map((c) => (
                            <li key={c.currency} className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-xs">
                              <div className="mb-1 font-medium">{c.currency}</div>
                              <div className="space-y-1 ltr-nums tabular-nums">
                                <p className={REVENUE_TEXT_CLASS}>
                                  {t("reports.revenue", "Revenue")}: {money(c.revenue, c.currency)}
                                </p>
                                <p className={EXPENSE_TEXT_CLASS}>
                                  {t("reports.expenses", "Expenses")}: {money(c.expenses, c.currency)}
                                </p>
                                <p className={c.netProfit < 0 ? "text-destructive" : "font-semibold"}>
                                  {t("reports.netProfit", "Net")}: {money(c.netProfit, c.currency)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                <ResponsiveTable className="hidden sm:block">
                  <ResponsiveTableElement minWidth="xl">
                    <thead className="bg-muted/60">
                      <tr className="text-start">
                        <th className="px-3 py-2 text-start font-medium">{t("reports.clinicColumn", "Clinic")}</th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.visits", "Visits")}</th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.newPatients", "New patients")}</th>
                        <th className="px-3 py-2 text-start font-medium">{t("reports.currencyColumn", "Currency")}</th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.revenue", "Revenue")}</th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.expenses", "Expenses")}</th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.netProfit", "Net profit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinicBreakdownRows.map((row) => (
                        <tr key={row.key} className="border-t align-top">
                          {row.showClinicMeta ? (
                            <>
                              <td rowSpan={row.clinicRowSpan} className="px-3 py-3">
                                <p className="font-medium">
                                  {formatClinicName(
                                    { nameEn: row.clinic.clinicNameEn, nameAr: row.clinic.clinicNameAr },
                                    i18n.language,
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t("reports.defaultCurrency", "Default")}: {row.clinic.defaultCurrency}
                                </p>
                              </td>
                              <td rowSpan={row.clinicRowSpan} className="px-3 py-3 text-end ltr-nums tabular-nums">
                                {row.clinic.visits}
                              </td>
                              <td rowSpan={row.clinicRowSpan} className="px-3 py-3 text-end ltr-nums tabular-nums">
                                {row.clinic.newPatients}
                              </td>
                            </>
                          ) : null}
                          <td className="px-3 py-3">{row.currencyRow?.currency ?? "—"}</td>
                          <td className={`px-3 py-3 text-end ltr-nums tabular-nums ${REVENUE_TEXT_CLASS}`}>
                            {row.currencyRow ? money(row.currencyRow.revenue, row.currencyRow.currency) : "—"}
                          </td>
                          <td className={`px-3 py-3 text-end ltr-nums tabular-nums ${EXPENSE_TEXT_CLASS}`}>
                            {row.currencyRow ? money(row.currencyRow.expenses, row.currencyRow.currency) : "—"}
                          </td>
                          <td
                            className={`px-3 py-3 text-end font-semibold ltr-nums tabular-nums ${
                              row.currencyRow && row.currencyRow.netProfit < 0 ? "text-destructive" : ""
                            }`}
                          >
                            {row.currencyRow ? money(row.currencyRow.netProfit, row.currencyRow.currency) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </ResponsiveTableElement>
                </ResponsiveTable>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("nav.revenue")} vs {t("nav.expenses")}
            {currencies.length === 1 ? ` (${currencies[0]})` : currencies.length > 1 ? t("reports.multiCurrency", " · multi-currency") : ""}
          </CardTitle>
          <CardDescription>
            {t(
              "reports.revenueVsExpensesHintRange",
              "Monthly posted revenue and approved/pending expenses for {{from}} → {{to}}. Amounts are grouped by currency — no FX conversion.",
              { from, to },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {series.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : series.isError ? (
            <p className="text-sm text-destructive">
              {series.error instanceof Error ? series.error.message : t("common.error")}
            </p>
          ) : currencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noFinancialActivity", "No revenue or expenses in this period.")}</p>
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => String(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const currency = name.split("_").pop() ?? series.data?.baseCurrency ?? "AED";
                      const kind = name.startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses");
                      return [money(Number(value), currency), `${kind} (${currency})`];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {currencies.map((currency) => (
                    <Area
                      key={`rev-${currency}`}
                      type="monotone"
                      dataKey={`revenue_${currency}`}
                      name={`${t("nav.revenue")} (${currency})`}
                      stroke={REVENUE_CHART_COLOR}
                      fill={REVENUE_CHART_COLOR}
                      fillOpacity={0.22}
                      strokeWidth={2}
                      stackId={`rev-${currency}`}
                    />
                  ))}
                  {currencies.map((currency) => (
                    <Area
                      key={`exp-${currency}`}
                      type="monotone"
                      dataKey={`expenses_${currency}`}
                      name={`${t("nav.expenses")} (${currency})`}
                      stroke={EXPENSE_CHART_COLOR}
                      fill={EXPENSE_CHART_COLOR}
                      fillOpacity={0.18}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      stackId={`exp-${currency}`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </CardContent>
      </Card>

      {currencies.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {currencies.map((currency) => (
              <Card key={currency}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("reports.chartRevenueByCurrency", "Revenue vs expenses ({{currency}})", { currency })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartFrame className="h-56 w-full sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => money(Number(v), currency)} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            money(Number(value), currency),
                            name.startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses"),
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey={`revenue_${currency}`}
                          name={t("nav.revenue")}
                          stroke={REVENUE_CHART_COLOR}
                          fill={REVENUE_CHART_COLOR}
                          fillOpacity={0.25}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey={`expenses_${currency}`}
                          name={t("nav.expenses")}
                          stroke={EXPENSE_CHART_COLOR}
                          fill={EXPENSE_CHART_COLOR}
                          fillOpacity={0.15}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </CardContent>
              </Card>
            ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.chartVisits", "Visit volume")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartFrame className="h-56 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                  <Tooltip formatter={(value: number) => [value, t("reports.visits", "Visits")]} labelFormatter={(l) => String(l)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    name={t("reports.visits", "Visits")}
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.25)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
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
          <CardContent>
            <ChartFrame className="h-56 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => String(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const currency = String(name).replace(/^revenue_/, "");
                      return [money(Number(value), currency), currency];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {currencies.map((currency) => (
                    <Line
                      key={currency}
                      type="monotone"
                      dataKey={`revenue_${currency}`}
                      name={`${t("nav.revenue")} (${currency})`}
                      stroke={REVENUE_CHART_COLOR}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.chartNewPatients", "New patient intake")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartFrame className="h-56 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                <Tooltip formatter={(value: number) => [value, t("reports.newPatients", "New patients")]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="newPatients" name={t("reports.newPatients", "New patients")} fill={REVENUE_CHART_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
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
                <ChartFrame className="h-56 w-full sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={acquisitionChartData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius="72%"
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
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartFrame>
                <ChartFrame className="h-56 w-full sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={acquisitionChartData} layout="vertical" margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number) => [value, t("reports.newPatients", "New patients")]} />
                      <Bar dataKey="count" name={t("reports.newPatients", "New patients")} radius={[0, 4, 4, 0]}>
                        {acquisitionChartData.map((_, index) => (
                          <Cell key={index} fill={ACQUISITION_CHART_COLORS[index % ACQUISITION_CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>
              <p className="text-xs text-muted-foreground">{t("reports.acquisitionRowHint", "Click a channel row to view patients.")}</p>
              <ResponsiveTable>
                <ResponsiveTableElement minWidth="sm">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">{t("reports.acquisitionChannel", "Channel")}</th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.acquisitionCount", "Patients")}</th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">{t("reports.acquisitionShare", "Share")}</th>
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
                        <td className="px-3 py-2 text-end ltr-nums tabular-nums">{row.count}</td>
                        <td className="px-3 py-2 text-end ltr-nums tabular-nums">{row.sharePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTableElement>
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
