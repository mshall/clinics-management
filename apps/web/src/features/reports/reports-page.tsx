import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  CircleHelp,
  HeartPulse,
  Landmark,
  Percent,
  Scissors,
  Share2,
  Table2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
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
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AcquisitionChannelPatientsDialog } from "@/components/acquisition-channel-patients-dialog";
import { ResponsiveTable, ResponsiveTableElement } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { featureTabTriggerClassName, featureTabsListClassName } from "@/lib/feature-tabs";
import { Rp04FinanceReportsPage } from "@/features/reports/rp04-finance-reports-page";
import { cn } from "@/lib/utils";
import {
  useClinicsQuery,
  useReportsClinicBreakdownQuery,
  useReportsKiorexImpactQuery,
  useReportsMonthlySeriesQuery,
  useReportsOperationsQuery,
  useReportsEncounterAcquisitionQuery,
  useReportsOperationAcquisitionQuery,
  useReportsPatientAcquisitionQuery,
  useReportsPerformanceQuery,
} from "@/lib/api-hooks";
import { apiDownload } from "@/lib/http";
import type {
  ReportsClinicBreakdownItemDto,
  ReportsCurrencyTotalsDto,
  ReportsMonthlySeriesItemDto,
} from "@/lib/api-types";
import { formatClinicName, formatRevenueCategory, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import {
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";
import { AcquisitionChannelCell, ReportColumnHead } from "@/lib/patient-acquisition-icons";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";
import { useAuthStore } from "@/stores/auth-store";
import { useDateRangeStore } from "@/stores/date-range-store";

const ACQUISITION_CHART_COLORS = [
  "var(--kx-chart-1)",
  "var(--kx-chart-2)",
  "var(--kx-chart-3)",
  "var(--kx-chart-4)",
  "var(--kx-chart-5)",
  "var(--kx-chart-7)",
  "var(--kx-chart-6)",
];

const REVENUE_CHART_COLOR = "var(--kx-chart-2)";
const EXPENSE_CHART_COLOR = "var(--kx-chart-3)";

/** Distinct stroke/fill per currency so multi-currency legends stay readable. */
const CURRENCY_CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 70% 38%)",
  "hsl(32 95% 44%)",
  "hsl(280 65% 52%)",
  "hsl(0 72% 48%)",
  "hsl(174 62% 36%)",
  "hsl(24 90% 48%)",
  "hsl(200 70% 42%)",
];

function currencyChartColor(index: number): string {
  return CURRENCY_CHART_COLORS[index % CURRENCY_CHART_COLORS.length]!;
}

const REVENUE_TEXT_CLASS = "font-semibold text-kx-ocean-800 dark:text-kx-ocean-400";
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

function OpsKpiHelp({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-700 shadow-sm transition-colors hover:border-sky-500/70 hover:bg-sky-500/15 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-300 dark:hover:text-sky-200"
          aria-label={tip}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        sideOffset={8}
        className="max-w-[17rem] text-start text-xs leading-snug"
        onPointerDownOutside={() => setOpen(false)}
      >
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function OpsKpiTile({
  label,
  tip,
  labelClassName,
  valueClassName,
  children,
  meta,
}: {
  label: string;
  tip: string;
  labelClassName: string;
  valueClassName?: string;
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-xs font-semibold uppercase tracking-wide", labelClassName)}>{label}</p>
        <OpsKpiHelp tip={tip} />
      </div>
      <div className={cn("mt-1 text-2xl font-semibold ltr-nums", valueClassName)}>{children}</div>
      {meta}
    </div>
  );
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const loc = localeForLanguage(i18n.language);
  const authUser = useAuthStore((s) => s.user);
  const orgBaseCurrency = useOrgBaseCurrency();
  const isPhysician = authUser?.role === "physician";
  const { from, to } = useDateRangeStore();
  const [scopeClinicId, setScopeClinicId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<{ channel: string; label: string } | null>(null);
  const [mainTab, setMainTab] = useState("tables");
  /** "" | "contract" | "standard" */
  const [opAcquisitionContractFilter, setOpAcquisitionContractFilter] = useState("");

  const { data: clinics = [] } = useClinicsQuery();
  const clinicScopeId = scopeClinicId.trim() || undefined;

  const series = useReportsMonthlySeriesQuery(from, to, clinicScopeId);
  const performance = useReportsPerformanceQuery(from, to, clinicScopeId);
  const operations = useReportsOperationsQuery(from, to, clinicScopeId);
  const kiorexPeriod = from.slice(0, 7);
  const kiorexImpact = useReportsKiorexImpactQuery(kiorexPeriod);
  const clinicBreakdown = useReportsClinicBreakdownQuery(from, to, !isPhysician && !clinicScopeId);
  const acquisition = useReportsPatientAcquisitionQuery(from, to);
  const operationAcquisition = useReportsOperationAcquisitionQuery({
    from,
    to,
    clinicId: clinicScopeId,
    isContract: opAcquisitionContractFilter || undefined,
  });
  const encounterAcquisition = useReportsEncounterAcquisitionQuery({
    from,
    to,
    clinicId: clinicScopeId,
  });

  /** Currencies that actually have posted revenue in the series (not a fixed AED/EGP/USD list). */
  const revenueCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const item of series.data?.items ?? []) {
      for (const row of item.revenueByCurrency) {
        if (Math.abs(row.amount) > 0.0001) set.add(row.currency);
      }
    }
    for (const row of performance.data?.byCurrency ?? []) {
      if (Math.abs(row.revenue) > 0.0001) set.add(row.currency);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [series.data?.items, performance.data?.byCurrency]);

  const expenseCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const item of series.data?.items ?? []) {
      for (const row of item.expensesByCurrency) {
        if (Math.abs(row.amount) > 0.0001) set.add(row.currency);
      }
    }
    for (const row of performance.data?.byCurrency ?? []) {
      if (Math.abs(row.expenses) > 0.0001) set.add(row.currency);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [series.data?.items, performance.data?.byCurrency]);

  const currencies = useMemo(
    () => [...new Set([...revenueCurrencies, ...expenseCurrencies])].sort((a, b) => a.localeCompare(b)),
    [revenueCurrencies, expenseCurrencies],
  );

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

  const operationAcquisitionRows = useMemo(() => {
    return (operationAcquisition.data?.items ?? []).map((item) => ({
      ...item,
      label:
        item.channel === "UNKNOWN"
          ? t("reports.acquisitionUnknown", "Not specified")
          : patientAcquisitionLabel(item.channel as PatientAcquisitionChannel, t),
      paidTotal: item.byCurrency.reduce((sum, m) => sum + m.paidAmount, 0),
      costTotal: item.byCurrency.reduce((sum, m) => sum + m.totalCost, 0),
    }));
  }, [operationAcquisition.data?.items, t]);

  const encounterAcquisitionRows = useMemo(() => {
    return (encounterAcquisition.data?.items ?? []).map((item) => ({
      ...item,
      label:
        item.channel === "UNKNOWN"
          ? t("reports.acquisitionUnknown", "Not specified")
          : patientAcquisitionLabel(item.channel as PatientAcquisitionChannel, t),
    }));
  }, [encounterAcquisition.data?.items, t]);
  
  const combinedAcquisitionRows = useMemo(() => {
    const encBy = new Map(encounterAcquisitionRows.map((r) => [r.channel, r]));
    const opBy = new Map(operationAcquisitionRows.map((r) => [r.channel, r]));
    const encTotal = encounterAcquisitionRows.reduce((s, r) => s + r.encounterCount, 0);
    const opTotal = operationAcquisitionRows.reduce((s, r) => s + r.operationCount, 0);
    const channels = new Set<string>([
      ...acquisitionChartData.map((r) => r.channel),
      ...encBy.keys(),
      ...opBy.keys(),
    ]);
    return [...channels]
      .map((channel) => {
        const patients = acquisitionChartData.find((r) => r.channel === channel);
        const enc = encBy.get(channel);
        const op = opBy.get(channel);
        const label =
          patients?.label ??
          enc?.label ??
          op?.label ??
          (channel === "UNKNOWN"
            ? t("reports.acquisitionUnknown", "Not specified")
            : patientAcquisitionLabel(channel as PatientAcquisitionChannel, t));
        const encounterCount = enc?.encounterCount ?? 0;
        const operationCount = op?.operationCount ?? 0;
        return {
          channel,
          label,
          patientCount: patients?.count ?? 0,
          patientShare: patients?.sharePercent ?? 0,
          encounterCount,
          encounterShare: encTotal > 0 ? Math.round((encounterCount / encTotal) * 1000) / 10 : 0,
          operationCount,
          operationShare: opTotal > 0 ? Math.round((operationCount / opTotal) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.patientCount - a.patientCount || b.encounterCount - a.encounterCount || a.label.localeCompare(b.label));
  }, [acquisitionChartData, encounterAcquisitionRows, operationAcquisitionRows, t]);

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

  const exportQuery = useMemo(() => {
    const q = new URLSearchParams({ from, to });
    if (clinicScopeId) q.set("clinicId", clinicScopeId);
    return q.toString();
  }, [from, to, clinicScopeId]);

  const downloadReport = async (key: string, format: "xlsx" | "pdf") => {
    const ext = format === "pdf" ? "pdf" : "xls";
    await apiDownload(`/api/v1/reports/${key}/export?format=${format}&${exportQuery}`, `kiorly-${key}.${ext}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("reports.title")}</h1>
        <p className="text-muted-foreground">{t("reports.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground ltr-nums">
          {t("reports.usingRange")}: {from} → {to}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="min-w-0 h-full">
          <Card data-testid="reports-exports" className="h-full">
        <CardHeader>
          <CardTitle className="text-base">{t("reports.exportPayments", "Payments export")}</CardTitle>
          <CardDescription>
            {t(
              "reports.exportPaymentsHint",
              "Date, patient, service, amount, method, reference — for your accountant.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadReport("payments", "xlsx")}>
            {t("reports.exportExcel", "Export Excel")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadReport("payments", "pdf")}>
            {t("reports.exportPdf", "Export PDF")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void downloadReport("operations", "xlsx")}>
            {t("reports.operationsTitle", "Operations KPIs")} · {t("reports.exportExcel", "Export Excel")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void downloadReport("performance", "xlsx")}>
            {t("reports.performanceTitle", "Performance summary")} · {t("reports.exportExcel", "Export Excel")}
          </Button>
        </CardContent>
      </Card>
        </div>
        <div className="min-w-0 h-full">
          <Card className="h-full">
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
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className={cn(featureTabsListClassName, "grid-cols-1 sm:grid-cols-3")}>
          <TabsTrigger value="tables" className={featureTabTriggerClassName("sky")} data-testid="reports-tab-tables">
            <Table2 className="size-4 shrink-0" aria-hidden />
            {t("reports.tabTables", "Tables")}
          </TabsTrigger>
          <TabsTrigger value="charts" className={featureTabTriggerClassName("violet")} data-testid="reports-tab-charts">
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            {t("reports.tabCharts", "Charts")}
          </TabsTrigger>
          <TabsTrigger value="finance" className={featureTabTriggerClassName("emerald")} data-testid="reports-tab-finance">
            <Landmark className="size-4 shrink-0" aria-hidden />
            {t("reports.tabArAgingPl", "AR aging & branch P&L")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="space-y-4 sm:space-y-6 focus-visible:outline-none">
<Card data-testid="reports-kiorex-impact">
        <CardHeader>
          <CardTitle className="text-base">{t("reports.kiorexImpactTitle", "Kiorex impact")}</CardTitle>
          <CardDescription>
            {t(
              "reports.kiorexImpactHint",
              "Bookings, new patients, visit revenue, commission, offset, and net cost per new patient (reconciled with the monthly statement).",
            )}{" "}
            <span className="ltr-nums">({kiorexPeriod})</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kiorexImpact.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : kiorexImpact.isError ? (
            <p className="text-sm text-destructive">
              {kiorexImpact.error instanceof Error ? kiorexImpact.error.message : t("common.error")}
            </p>
          ) : (
            <TooltipProvider delayDuration={0}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OpsKpiTile
                  label={t("reports.kiorexBookings", "Bookings")}
                  tip={t(
                    "reports.kiorexBookingsHelp",
                    "Marketplace bookings attributed to Kiorex in the selected month.",
                  )}
                  labelClassName="text-violet-700 dark:text-violet-400"
                  valueClassName="text-violet-700 dark:text-violet-400"
                >
                  {kiorexImpact.data?.bookings ?? 0}
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.kiorexNewPatients", "New patients")}
                  tip={t(
                    "reports.kiorexNewPatientsHelp",
                    "New patients acquired through Kiorex in the selected month.",
                  )}
                  labelClassName="text-emerald-700 dark:text-emerald-400"
                  valueClassName="text-emerald-700 dark:text-emerald-400"
                >
                  {kiorexImpact.data?.newPatients ?? 0}
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.kiorexCommission", "Commission")}
                  tip={t(
                    "reports.kiorexCommissionHelp",
                    "Commission owed for Kiorex bookings in the selected month.",
                  )}
                  labelClassName="text-amber-700 dark:text-amber-400"
                  valueClassName="text-amber-700 dark:text-amber-400"
                >
                  {kiorexImpact.data?.commission ?? 0}
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.kiorexOffset", "Offset")}
                  tip={t(
                    "reports.kiorexOffsetHelp",
                    "Credits or offsets applied against Kiorex commission.",
                  )}
                  labelClassName="text-sky-700 dark:text-sky-400"
                  valueClassName="text-sky-700 dark:text-sky-400"
                >
                  {kiorexImpact.data?.offset ?? 0}
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.kiorexNetCostPerPatient", "Net cost / new patient")}
                  tip={t(
                    "reports.kiorexNetCostHelp",
                    "Net Kiorex cost divided by new patients acquired in the month.",
                  )}
                  labelClassName="text-rose-700 dark:text-rose-400"
                  valueClassName="text-rose-700 dark:text-rose-400"
                  meta={
                    <p className="text-xs text-muted-foreground">
                      {kiorexImpact.data?.matchesStatement
                        ? t("reports.kiorexMatchesStatement", "Matches monthly statement (CR-11)")
                        : t(
                            "reports.kiorexStatementPending",
                            "Statement reconcile pending (no confirmed commission yet)",
                          )}
                    </p>
                  }
                >
                  {kiorexImpact.data?.netCostPerNewPatient ?? "—"}
                </OpsKpiTile>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Card data-testid="reports-operations-kpis">
        <CardHeader>
          <CardTitle className="text-base">{t("reports.operationsTitle", "Operations KPIs")}</CardTitle>
          <CardDescription>
            {t(
              "reports.operationsHint",
              "No-show rate, utilisation, revenue per doctor-hour, new vs returning, and booking sources (incl. Kiorex).",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {operations.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : operations.isError ? (
            <p className="text-sm text-destructive">
              {operations.error instanceof Error ? operations.error.message : t("common.error")}
            </p>
          ) : (
            <TooltipProvider delayDuration={0}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OpsKpiTile
                  label={t("reports.noShowRate", "No-show rate")}
                  tip={t(
                    "reports.noShowRateHelp",
                    "Share of appointments that were marked no-show: NO_SHOW ÷ (COMPLETED + NO_SHOW).",
                  )}
                  labelClassName="text-red-700 dark:text-red-400"
                  valueClassName="text-red-700 dark:text-red-400"
                  meta={
                    <p className="text-xs text-red-700/70 dark:text-red-400/70 ltr-nums">
                      {operations.data?.noShow.noShows ?? 0}/{operations.data?.noShow.total ?? 0}
                    </p>
                  }
                >
                  {operations.data?.noShow.rate ?? 0}%
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.utilisation", "Utilisation")}
                  tip={t(
                    "reports.utilisationHelp",
                    "Booked clinic minutes ÷ available doctor minutes (defaults to 8h × clinicians × days when schedules are sparse).",
                  )}
                  labelClassName="text-amber-700 dark:text-amber-400"
                  valueClassName="text-amber-700 dark:text-amber-400"
                >
                  {operations.data?.utilisation.percent ?? 0}%
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.revenuePerDoctorHour", "Revenue / doctor-hour")}
                  tip={t(
                    "reports.revenuePerDoctorHourHelp",
                    "Posted revenue in the period divided by booked doctor hours (booked minutes ÷ 60).",
                  )}
                  labelClassName="text-sky-700 dark:text-sky-400"
                  valueClassName="text-sky-700 dark:text-sky-400"
                >
                  {operations.data?.revenuePerDoctorHour ?? 0}
                </OpsKpiTile>
                <OpsKpiTile
                  label={t("reports.newVsReturning", "New / returning")}
                  tip={t(
                    "reports.newVsReturningHelp",
                    "Appointments booked as a first-time patient (new) versus patients who already had history (returning).",
                  )}
                  labelClassName="text-emerald-700 dark:text-emerald-400"
                  valueClassName="text-emerald-700 dark:text-emerald-400"
                >
                  {operations.data?.newVsReturning.newPatients ?? 0}
                  <span className="text-emerald-700/50 dark:text-emerald-400/50"> / </span>
                  {operations.data?.newVsReturning.returning ?? 0}
                </OpsKpiTile>
                {(operations.data?.bookingSources ?? []).slice(0, 4).map((s) => (
                  <OpsKpiTile
                    key={s.source}
                    label={s.source}
                    tip={t(
                      "reports.bookingSourceHelp",
                      "Share of appointments from this booking source in the selected period (front desk, clinic link, Kiorex, and others).",
                    )}
                    labelClassName="text-violet-700 dark:text-violet-400"
                    valueClassName="text-violet-700 dark:text-violet-400"
                  >
                    {s.count}{" "}
                    <span className="text-sm font-normal text-violet-700/70 dark:text-violet-400/70">
                      ({s.sharePercent}%)
                    </span>
                  </OpsKpiTile>
                ))}
              </div>
            </TooltipProvider>
          )}
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
              <TooltipProvider delayDuration={0}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <OpsKpiTile
                    label={t("reports.visits", "Visits")}
                    tip={t(
                      "reports.visitsHelp",
                      "Encounters created in the selected period for this clinic scope (draft and finalized).",
                    )}
                    labelClassName="text-sky-700 dark:text-sky-400"
                    valueClassName="text-sky-700 dark:text-sky-400"
                  >
                    {performance.data?.visits ?? 0}
                  </OpsKpiTile>
                  <OpsKpiTile
                    label={t("reports.newPatients", "New patients")}
                    tip={t(
                      "reports.newPatientsHelp",
                      "Patients whose first registration (createdAt) falls in this period for the selected scope.",
                    )}
                    labelClassName="text-emerald-700 dark:text-emerald-400"
                    valueClassName="text-emerald-700 dark:text-emerald-400"
                  >
                    {performance.data?.newPatients ?? 0}
                  </OpsKpiTile>
                  <OpsKpiTile
                    label={t("reports.appointmentsCompleted", "Appointments completed")}
                    tip={t(
                      "reports.appointmentsCompletedHelp",
                      "Appointments marked completed in the selected period for this clinic scope.",
                    )}
                    labelClassName="text-violet-700 dark:text-violet-400"
                    valueClassName="text-violet-700 dark:text-violet-400"
                  >
                    {performance.data?.appointmentsCompleted ?? 0}
                  </OpsKpiTile>
                  <OpsKpiTile
                    label={t("reports.currenciesActive", "Currencies in period")}
                    tip={t(
                      "reports.currenciesActiveHelp",
                      "Distinct currencies that appear on posted revenue or expenses in this period.",
                    )}
                    labelClassName="text-amber-700 dark:text-amber-400"
                    valueClassName="text-amber-700 dark:text-amber-400"
                  >
                    {performanceByCurrency.length}
                  </OpsKpiTile>
                  {performance.data?.kiorexRating?.averageRating != null ? (
                    <OpsKpiTile
                      label={t("reports.kiorexRating", "Kiorex rating")}
                      tip={t(
                        "reports.kiorexRatingHelp",
                        "Average patient rating from Kiorex marketplace reviews linked to this organization.",
                      )}
                      labelClassName="text-rose-700 dark:text-rose-400"
                      valueClassName="text-rose-700 dark:text-rose-400"
                      meta={
                        <p className="text-xs text-muted-foreground">
                          {t("kiorexTab.ratings.count", "{{count}} reviews", {
                            count: performance.data.kiorexRating.reviewCount,
                          })}
                        </p>
                      }
                    >
                      <span data-testid="reports-kiorex-rating">
                        {performance.data.kiorexRating.averageRating.toFixed(2)}
                      </span>
                    </OpsKpiTile>
                  ) : null}
                </div>
              </TooltipProvider>

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
                          <dd className={`font-semibold ltr-nums ${row.netProfit < 0 ? "text-destructive" : "text-[hsl(var(--success))] "}`}>
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
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("reports.encounters", "Encounters")}</p>
                          <p className="font-medium ltr-nums tabular-nums">{row.visits}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("reports.operations", "Operations")}</p>
                          <p className="font-medium ltr-nums tabular-nums">{row.operationCount}</p>
                          {(row.contractOperationCount ?? 0) > 0 ? (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              {t("reports.contractOpsShort", "{{count}} contract", {
                                count: row.contractOperationCount,
                              })}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("reports.newPatients", "New patients")}</p>
                          <p className="font-medium ltr-nums tabular-nums">{row.newPatients}</p>
                        </div>
                      </div>
                      {(row.operationPaidTotal ?? 0) > 0 || (row.operationTotalCost ?? 0) > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground ltr-nums">
                          {t("reports.operationMoneyLine", "Ops paid {{paid}} · total {{total}}", {
                            paid: money(row.operationPaidTotal ?? 0, row.defaultCurrency),
                            total: money(row.operationTotalCost ?? 0, row.defaultCurrency),
                          })}
                        </p>
                      ) : null}
                      {row.byCurrency.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">—</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {row.byCurrency.map((c) => (
                            <li key={c.currency} className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-xs">
                              <div className="mb-1 font-medium">{c.currency}</div>
                              <div className="space-y-1 ltr-nums tabular-nums">
                                <p className={REVENUE_TEXT_CLASS}>
                                  {t("reports.revenueTotal", "Total revenue")}: {money(c.revenue, c.currency)}
                                </p>
                                <p className="text-foreground/90">
                                  {t("reports.encounterRevenue", "Encounter / visit fees")}:{" "}
                                  {money(c.encounterRevenue ?? 0, c.currency)}
                                </p>
                                <p className="text-foreground/90">
                                  {t("reports.operationRevenue", "Operations")}: {money(c.operationRevenue ?? 0, c.currency)}
                                </p>
                                <p className="text-foreground/90">
                                  {t("reports.otherRevenue", "Other")}: {money(c.otherRevenue ?? 0, c.currency)}
                                </p>
                                {(c.otherBreakdown ?? []).length > 0 ? (
                                  <ul className="ms-2 space-y-0.5 border-s border-border/60 ps-2 text-muted-foreground">
                                    {(c.otherBreakdown ?? []).map((item) => (
                                      <li key={`${c.currency}-${item.category}`}>
                                        {formatRevenueCategory(item.category, t)}: {money(item.amount, c.currency)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
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
                        <th className="px-3 py-2 text-start font-medium">
                          <ReportColumnHead icon={<Building2 className="size-3.5" />} label={t("reports.clinicColumn", "Clinic")} tone="slate" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<HeartPulse className="size-3.5" />} label={t("reports.encounters", "Encounters")} tone="sky" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<Scissors className="size-3.5" />} label={t("reports.operations", "Operations")} tone="violet" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<UserPlus className="size-3.5" />} label={t("reports.newPatients", "New patients")} tone="emerald" />
                        </th>
                        <th className="px-3 py-2 text-start font-medium">
                          <ReportColumnHead icon={<CircleDollarSign className="size-3.5" />} label={t("reports.currencyColumn", "Currency")} tone="amber" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<Wallet className="size-3.5" />} label={t("reports.revenueTotal", "Total revenue")} tone="emerald" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<HeartPulse className="size-3.5" />} label={t("reports.encounterRevenue", "Encounter / visit fees")} tone="sky" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<Scissors className="size-3.5" />} label={t("reports.operationRevenue", "Operations revenue")} tone="violet" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<CircleDollarSign className="size-3.5" />} label={t("reports.otherRevenue", "Other revenue")} tone="amber" />
                        </th>
                        <th className="px-3 py-2 text-start font-medium">
                          <ReportColumnHead icon={<Share2 className="size-3.5" />} label={t("reports.otherRevenueBreakdown", "Other breakdown")} tone="slate" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<Wallet className="size-3.5" />} label={t("reports.expenses", "Expenses")} tone="rose" />
                        </th>
                        <th className="px-3 py-2 text-end font-medium ltr-nums">
                          <ReportColumnHead className="justify-end" icon={<CircleDollarSign className="size-3.5" />} label={t("reports.netProfit", "Net profit")} tone="emerald" />
                        </th>
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
                                <p>{row.clinic.operationCount}</p>
                                {(row.clinic.contractOperationCount ?? 0) > 0 ? (
                                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                    {t("reports.contractOpsShort", "{{count}} contract", {
                                      count: row.clinic.contractOperationCount,
                                    })}
                                  </p>
                                ) : null}
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
                          <td className="px-3 py-3 text-end ltr-nums tabular-nums">
                            {row.currencyRow
                              ? money(row.currencyRow.encounterRevenue ?? 0, row.currencyRow.currency)
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-end ltr-nums tabular-nums">
                            {row.currencyRow
                              ? money(row.currencyRow.operationRevenue ?? 0, row.currencyRow.currency)
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-end ltr-nums tabular-nums">
                            {row.currencyRow ? money(row.currencyRow.otherRevenue ?? 0, row.currencyRow.currency) : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {row.currencyRow && (row.currencyRow.otherBreakdown ?? []).length > 0 ? (
                              <ul className="space-y-1 ltr-nums tabular-nums">
                                {(row.currencyRow.otherBreakdown ?? []).map((item) => (
                                  <li key={`${row.key}-${item.category}`}>
                                    <span className="text-muted-foreground">
                                      {formatRevenueCategory(item.category, t)}:
                                    </span>{" "}
                                    {money(item.amount, row.currencyRow!.currency)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "—"
                            )}
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
            {t("reports.encounterAcquisitionTitle", "Encounters by how they found us")}
          </CardTitle>
          <CardDescription>
            {t(
              "reports.encounterAcquisitionHint",
              "Finalized visits and visit-fee money by acquisition channel for {{from}} → {{to}}.",
              { from, to },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {encounterAcquisition.isError ? (
            <p className="text-sm text-destructive">
              {encounterAcquisition.error instanceof Error
                ? encounterAcquisition.error.message
                : t("common.error")}
            </p>
          ) : encounterAcquisition.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : (encounterAcquisition.data?.totalEncounters ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("reports.encounterAcquisitionEmpty", "No finalized encounters in this period.")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground ltr-nums">
                {t("reports.encounterAcquisitionTotal", "{{count}} encounters in range", {
                  count: encounterAcquisition.data?.totalEncounters ?? 0,
                })}
              </p>
              <ResponsiveTable>
                <ResponsiveTableElement minWidth="md">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">
                        <ReportColumnHead icon={<Share2 className="size-3.5" />} label={t("reports.acquisitionChannel", "Channel")} tone="violet" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<HeartPulse className="size-3.5" />} label={t("reports.encounters", "Encounters")} tone="sky" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Wallet className="size-3.5" />} label={t("reports.operationChannelMoney", "Paid / total")} tone="emerald" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {encounterAcquisitionRows.map((row) => (
                      <tr key={row.channel} className="border-t">
                        <td className="px-3 py-2">
                          <AcquisitionChannelCell channel={row.channel} label={row.label} t={t} />
                        </td>
                        <td className="px-3 py-2 text-end font-semibold text-sky-700 ltr-nums tabular-nums dark:text-sky-400">{row.encounterCount}</td>
                        <td className="px-3 py-2 text-end text-xs ltr-nums tabular-nums">
                          {row.byCurrency.length === 0 ? (
                            "—"
                          ) : (
                            <ul className="space-y-0.5">
                              {row.byCurrency.map((m) => (
                                <li key={m.currency}>
                                  {money(m.paidAmount, m.currency)} / {money(m.totalCost, m.currency)}
                                </li>
                              ))}
                            </ul>
                          )}
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
<Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">
              {t("reports.operationAcquisitionTitle", "Operations by how they found us")}
            </CardTitle>
            <CardDescription>
              {t(
                "reports.operationAcquisitionHint",
                "Procedure volume and money by acquisition channel for {{from}} → {{to}}. Filter to contract (تعاقد) or standard paid operations.",
                { from, to },
              )}
            </CardDescription>
          </div>
          <div className="w-full sm:w-52">
            <Label htmlFor="op-acq-contract-filter" className="text-xs text-muted-foreground">
              {t("operations.contractFilter", "Contract type")}
            </Label>
            <select
              id="op-acq-contract-filter"
              className={nativeSelectClassName}
              value={opAcquisitionContractFilter}
              onChange={(e) => setOpAcquisitionContractFilter(e.target.value)}
              data-testid="reports-operation-acquisition-contract-filter"
            >
              <option value="">{t("operations.contractFilterAll", "All operations")}</option>
              <option value="contract">{t("operations.contractFilterContract", "Contract (تعاقد)")}</option>
              <option value="standard">{t("operations.contractFilterStandard", "Standard (paid)")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {operationAcquisition.isError ? (
            <p className="text-sm text-destructive">
              {operationAcquisition.error instanceof Error
                ? operationAcquisition.error.message
                : t("common.error")}
            </p>
          ) : operationAcquisition.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : (operationAcquisition.data?.totalOperations ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("reports.operationAcquisitionEmpty", "No operations in this period for the selected filters.")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground ltr-nums">
                {t("reports.operationAcquisitionTotal", "{{ops}} operations · {{contracts}} contract", {
                  ops: operationAcquisition.data?.totalOperations ?? 0,
                  contracts: operationAcquisition.data?.totalContract ?? 0,
                })}
              </p>
              <ResponsiveTable>
                <ResponsiveTableElement minWidth="md">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">
                        <ReportColumnHead icon={<Share2 className="size-3.5" />} label={t("reports.acquisitionChannel", "Channel")} tone="violet" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Scissors className="size-3.5" />} label={t("reports.operations", "Operations")} tone="sky" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Percent className="size-3.5" />} label={t("reports.contractOps", "Contract")} tone="emerald" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Wallet className="size-3.5" />} label={t("reports.operationChannelMoney", "Paid / total")} tone="amber" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {operationAcquisitionRows.map((row) => (
                      <tr key={row.channel} className="border-t">
                        <td className="px-3 py-2">
                          <AcquisitionChannelCell channel={row.channel} label={row.label} t={t} />
                        </td>
                        <td className="px-3 py-2 text-end font-semibold text-sky-700 ltr-nums tabular-nums dark:text-sky-400">{row.operationCount}</td>
                        <td className="px-3 py-2 text-end font-semibold ltr-nums tabular-nums text-emerald-800 dark:text-emerald-300">
                          {row.contractCount}
                        </td>
                        <td className="px-3 py-2 text-end text-xs ltr-nums tabular-nums">
                          {row.byCurrency.length === 0 ? (
                            "—"
                          ) : (
                            <ul className="space-y-0.5">
                              {row.byCurrency.map((m) => (
                                <li key={m.currency}>
                                  {money(m.paidAmount, m.currency)} / {money(m.totalCost, m.currency)}
                                </li>
                              ))}
                            </ul>
                          )}
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.acquisitionTitle", "How patients found us")}</CardTitle>
          <CardDescription>
            {t(
              "reports.acquisitionCombinedHint",
              "Patient registrations plus encounters and operations by acquisition channel for {{from}} → {{to}}.",
              { from, to },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {acquisition.isError || encounterAcquisition.isError || operationAcquisition.isError ? (
            <p className="text-sm text-destructive">
              {(acquisition.error instanceof Error && acquisition.error.message) ||
                (encounterAcquisition.error instanceof Error && encounterAcquisition.error.message) ||
                (operationAcquisition.error instanceof Error && operationAcquisition.error.message) ||
                t("common.error")}
            </p>
          ) : acquisition.isPending || encounterAcquisition.isPending || operationAcquisition.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : combinedAcquisitionRows.length === 0 ? (
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
              <p className="text-xs text-muted-foreground">{t("reports.acquisitionRowHint", "Click a channel row to view patients.")}</p>
              <ResponsiveTable>
                <ResponsiveTableElement minWidth="lg">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <th className="px-3 py-2 font-medium">
                        <ReportColumnHead icon={<Share2 className="size-3.5" />} label={t("reports.acquisitionChannel", "Channel")} tone="violet" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Users className="size-3.5" />} label={t("reports.acquisitionCount", "Patients")} tone="sky" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Percent className="size-3.5" />} label={t("reports.acquisitionShare", "Share")} tone="sky" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<HeartPulse className="size-3.5" />} label={t("reports.encounters", "Encounters")} tone="emerald" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Percent className="size-3.5" />} label={t("reports.encounterShare", "Encounter share")} tone="emerald" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Scissors className="size-3.5" />} label={t("reports.operations", "Operations")} tone="amber" />
                      </th>
                      <th className="px-3 py-2 text-end font-medium ltr-nums">
                        <ReportColumnHead className="justify-end" icon={<Percent className="size-3.5" />} label={t("reports.operationShare", "Operation share")} tone="amber" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedAcquisitionRows.map((row) => (
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
                        <td className="px-3 py-2">
                          <AcquisitionChannelCell channel={row.channel} label={row.label} t={t} />
                        </td>
                        <td className="px-3 py-2 text-end font-semibold text-sky-700 ltr-nums tabular-nums dark:text-sky-400">{row.patientCount}</td>
                        <td className="px-3 py-2 text-end text-sky-700/80 ltr-nums tabular-nums dark:text-sky-400/80">{row.patientShare}%</td>
                        <td className="px-3 py-2 text-end font-semibold text-emerald-700 ltr-nums tabular-nums dark:text-emerald-400">{row.encounterCount}</td>
                        <td className="px-3 py-2 text-end text-emerald-700/80 ltr-nums tabular-nums dark:text-emerald-400/80">{row.encounterShare}%</td>
                        <td className="px-3 py-2 text-end font-semibold text-amber-700 ltr-nums tabular-nums dark:text-amber-400">{row.operationCount}</td>
                        <td className="px-3 py-2 text-end text-amber-700/80 ltr-nums tabular-nums dark:text-amber-400/80">{row.operationShare}%</td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTableElement>
              </ResponsiveTable>
            </>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="charts" className="space-y-4 sm:space-y-6 focus-visible:outline-none">
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
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => String(v)} />
                  <ChartTooltip
                    formatter={(value, name) => {
                      const currency = String(name ?? "").split("_").pop() ?? series.data?.baseCurrency ?? orgBaseCurrency;
                      const kind = String(name ?? "").startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses");
                      return [money(Number(value), currency), `${kind} (${currency})`];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {revenueCurrencies.map((currency, index) => {
                    const color = currencyChartColor(index);
                    return (
                      <Area
                        key={`rev-${currency}`}
                        type="monotone"
                        dataKey={`revenue_${currency}`}
                        name={`${t("nav.revenue")} (${currency})`}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.22}
                        strokeWidth={2}
                        stackId={`rev-${currency}`}
                      />
                    );
                  })}
                  {expenseCurrencies.map((currency, index) => {
                    const color = currencyChartColor(index + revenueCurrencies.length);
                    return (
                      <Area
                        key={`exp-${currency}`}
                        type="monotone"
                        dataKey={`expenses_${currency}`}
                        name={`${t("nav.expenses")} (${currency})`}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.12}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        stackId={`exp-${currency}`}
                      />
                    );
                  })}
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
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => money(Number(v), currency)} />
                        <ChartTooltip
                          formatter={(value, name) => [
                            money(Number(value), currency),
                            String(name ?? "").startsWith("revenue_") ? t("nav.revenue") : t("nav.expenses"),
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
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                  <ChartTooltip formatter={(value) => [value, t("reports.visits", "Visits")]} labelFormatter={(l) => String(l)} />
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
              {revenueCurrencies.length === 1
                ? t("reports.chartRevenueCurrency", "Posted revenue ({{currency}})", {
                    currency: revenueCurrencies[0],
                  })
                : t("reports.chartRevenueMulti", "Posted revenue by currency")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueCurrencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("reports.noFinancialActivity", "No revenue or expenses in this period.")}
              </p>
            ) : (
              <ChartFrame className="h-56 w-full sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => String(v)} />
                    <ChartTooltip
                      formatter={(value, name) => {
                        const currency = String(name).replace(/^revenue_/, "");
                        return [money(Number(value), currency), `${t("nav.revenue")} (${currency})`];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {revenueCurrencies.map((currency, index) => (
                      <Line
                        key={currency}
                        type="monotone"
                        dataKey={`revenue_${currency}`}
                        name={`${t("nav.revenue")} (${currency})`}
                        stroke={currencyChartColor(index)}
                        strokeWidth={2.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
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
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                <ChartTooltip formatter={(value) => [value, t("reports.newPatients", "New patients")]} />
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
        <CardContent className="space-y-4">
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
                        label={({ name, percent }) =>
                          `${name ?? ""} (${typeof percent === "number" ? Math.round(percent * 100) : 0}%)`
                        }
                        labelLine={false}
                      >
                        {acquisitionChartData.map((_, index) => (
                          <Cell key={index} fill={ACQUISITION_CHART_COLORS[index % ACQUISITION_CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        formatter={(value, _name, item) => [
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
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 10 }} />
                      <ChartTooltip formatter={(value) => [value, t("reports.newPatients", "New patients")]} />
                      <Bar dataKey="count" name={t("reports.newPatients", "New patients")} radius={[0, 4, 4, 0]}>
                        {acquisitionChartData.map((_, index) => (
                          <Cell key={index} fill={ACQUISITION_CHART_COLORS[index % ACQUISITION_CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>
            </>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="finance" className="focus-visible:outline-none">
          <Rp04FinanceReportsPage embedded />
        </TabsContent>
      </Tabs>

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
