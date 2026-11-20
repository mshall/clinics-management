import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DoctorStatementsCard } from "./doctor-statements-card";
import { useEffect, useMemo, useState } from "react";
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
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, BarChart3, CircleDollarSign, Table2 } from "lucide-react";
import { CreateActionButton } from "@/components/create-action-button";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { featureTabTriggerClassName, featureTabsListClassName } from "@/lib/feature-tabs";
import {
  useClinicsQuery,
  useClinicRevenueBreakdownQuery,
  usePayableOperationsQuery,
  useReportsMonthlySeriesQuery,
  useRevenueQuery,
  useRevenueReceivablesQuery,
  useRevenueTotalsQuery,
} from "@/lib/api-hooks";
import type { RevenueEntryDto, RevenueTotalsDto } from "@/lib/api-types";
import { apiPost } from "@/lib/http";
import { columnFilterIncludes, cn } from "@/lib/utils";
import {
  formatClinicName,
  formatClinicNameFields,
  formatRevenueLedgerCategory,
  formatRevenueStatus,
  localeForLanguage,
} from "@/lib/locale-display";
import { useDateRangeStore } from "@/stores/date-range-store";
import { useAuthStore } from "@/stores/auth-store";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectRevenueSubmitIssues } from "@/lib/create-form-validation";
import {
  filterActionsClassName,
  filterFieldClassName,
  filterToolbarClassName,
  nativeSelectClassName,
} from "@/lib/form-control-styles";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { formatMoneyAmount, formatMultiCurrencyAmounts } from "@/lib/money-display";
import { useClinicCurrencyResolver } from "@/lib/use-clinic-currency-resolver";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";
import { canMutateRevenue } from "@/lib/nav-tab-access-policy";

const CURRENCY_CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 70% 38%)",
  "hsl(32 95% 44%)",
  "hsl(280 65% 52%)",
  "hsl(0 72% 48%)",
  "hsl(174 62% 36%)",
  "hsl(24 90% 48%)",
];

function currencyChartColor(index: number): string {
  return CURRENCY_CHART_COLORS[index % CURRENCY_CHART_COLORS.length]!;
}

function clinicDisplayName(r: RevenueEntryDto, lng: string): string {
  return formatClinicNameFields(r.clinicNameEn, r.clinicNameAr, lng, r.clinicId);
}

function formatLedgerTotals(
  totals: RevenueTotalsDto | undefined,
  field: "grossTotal" | "netTotal",
  fallbackCurrency: string,
  locale: string,
): string {
  if (!totals) return "—";
  if (totals.byCurrency?.length) {
    return formatMultiCurrencyAmounts(
      totals.byCurrency.map((row) => ({ currency: row.currency, amount: row[field] })),
      locale,
    );
  }
  return formatMoneyAmount(totals[field], fallbackCurrency, locale);
}

export function RevenuePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { from, to, setRange, resetToCurrentMonth } = useDateRangeStore();
  const authUser = useAuthStore((s) => s.user);
  const canPostRevenue = canMutateRevenue(authUser?.role, authUser?.navTabKeys, authUser?.navTabAccessModes);
  const breakdownEnabled =
    authUser?.role === "group_admin" ||
    authUser?.role === "group_supervisor" ||
    authUser?.role === "clinic_admin" ||
    authUser?.role === "branch_manager";
  const bd = useClinicRevenueBreakdownQuery(breakdownEnabled);

  const [filterClinicId, setFilterClinicId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("postedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [mainTab, setMainTab] = useState("tables");

  const revParams = useMemo(
    () => ({
      from,
      to,
      clinicId: filterClinicId || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [from, to, filterClinicId, page, pageSize, sortBy, sortOrder],
  );

  const { data: revData, isPending, isError, error } = useRevenueQuery(revParams);
  const rows = revData?.items ?? [];
  const revTotal = revData?.total ?? 0;
  const revTotalPages = revData?.totalPages ?? 1;
  const totalsQ = useRevenueTotalsQuery({ from, to, clinicId: filterClinicId || undefined });
  const receivablesQ = useRevenueReceivablesQuery({ clinicId: filterClinicId || undefined, page: 1, pageSize: 15 });
  const receivableRows = receivablesQ.data?.items ?? [];
  const { data: clinics = [] } = useClinicsQuery();
  const orgBaseCurrency = useOrgBaseCurrency();
  const resolveClinicCurrency = useClinicCurrencyResolver();
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const [clinicId, setClinicId] = useState("");
  useEffect(() => {
    if (singleManagedClinic) {
      setFilterClinicId(singleManagedClinic.id);
      setClinicId(singleManagedClinic.id);
    }
  }, [singleManagedClinic?.id]);
  const [category, setCategory] = useState("VISIT_FEE");
  const [operationId, setOperationId] = useState("");
  const [gross, setGross] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [revenueCurrency, setRevenueCurrency] = useState<string>(orgBaseCurrency);
  const validation = useValidationIssuesDialog({ intent: "submit" });
  const [rfCategory, setRfCategory] = useState("");
  const [rfNet, setRfNet] = useState("");
  const [rfPosted, setRfPosted] = useState("");
  const [rfStatus, setRfStatus] = useState("");
  const [rfClinic, setRfClinic] = useState("");
  const [detail, setDetail] = useState<RevenueEntryDto | null>(null);

  const series = useReportsMonthlySeriesQuery(from, to, filterClinicId || undefined);

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data: payableOps = [] } = usePayableOperationsQuery(clinicId || filterClinicId || undefined);
  const selectedOperation = useMemo(
    () => payableOps.find((o) => o.id === operationId) ?? null,
    [payableOps, operationId],
  );
  const operationBalance = selectedOperation?.balanceDue ?? 0;
  const postClinicId = operationId && selectedOperation ? selectedOperation.clinicId : clinicId;
  const postClinicDefaultCurrency = resolveClinicCurrency(postClinicId || filterClinicId || singleManagedClinic?.id);
  const displayCurrency = resolveClinicCurrency(filterClinicId || clinicId || singleManagedClinic?.id);
  const locale = localeForLanguage(i18n.language);

  useEffect(() => {
    if (operationId && selectedOperation?.feeCurrency) {
      setRevenueCurrency(selectedOperation.feeCurrency);
      return;
    }
    setRevenueCurrency(postClinicDefaultCurrency);
  }, [operationId, selectedOperation?.feeCurrency, postClinicDefaultCurrency]);

  const money = (n: number, currency?: string) => formatMoneyAmount(n, currency ?? displayCurrency, locale);

  const grossN = Number.parseFloat(gross || "0");
  const vatN = Number.parseFloat(vatPercent || "0");
  const vatClamped = Number.isFinite(vatN) ? Math.min(100, Math.max(0, vatN)) : 0;
  const taxComputed = Math.round(grossN * (vatClamped / 100) * 100) / 100;
  const netComputed = Math.round((grossN - taxComputed) * 100) / 100;

  const paymentExceedsBalance =
    operationId.length > 0 && netComputed > 0 && netComputed > operationBalance + 0.001;

  const createMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        clinicId: postClinicId,
        category: operationId ? "OPERATION_PAYMENT" : category,
        description: operationId
          ? `Operation payment · ${selectedOperation?.patientName ?? selectedOperation?.patientMrn ?? operationId}`
          : `Manual entry ${new Date().toISOString().slice(0, 10)}`,
        grossAmount: grossN,
        taxAmount: taxComputed,
        netAmount: netComputed,
        currency: revenueCurrency,
        postedAt: new Date().toISOString(),
      };
      if (operationId) payload.operationId = operationId;
      return apiPost<unknown>("/api/v1/revenue", payload);
    },
    onSuccess: () => {
      validation.clear();
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["operations"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      void qc.invalidateQueries({ queryKey: ["reports", "monthly-series"] });
      setGross("");
      setVatPercent("");
      setOperationId("");
    },
    onError: (e: unknown) => {
      validation.showError(e);
    },
  });

  const handleSubmitRevenue = () => {
    const issues = collectRevenueSubmitIssues(
      {
        clinicId,
        operationId,
        operationClinicId: selectedOperation?.clinicId,
        gross,
        paymentExceedsBalance,
      },
      t,
    );
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    createMut.mutate();
  };

  const filteredRevenueRows = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    return rows.filter((r) => {
      if (rfClinic.trim() && !columnFilterIncludes(clinicDisplayName(r, i18n.language), rfClinic)) return false;
      if (
        rfCategory.trim() &&
        !columnFilterIncludes(formatRevenueLedgerCategory(r.category, t, r.description), rfCategory)
      ) {
        return false;
      }
      if (rfNet.trim()) {
        const hay = `${r.netAmount} ${formatMoneyAmount(r.netAmount, r.currency, loc)}`;
        if (!columnFilterIncludes(hay, rfNet)) return false;
      }
      if (rfPosted.trim()) {
        const ds = new Date(r.postedAt).toLocaleString(loc);
        if (!columnFilterIncludes(ds, rfPosted) && !columnFilterIncludes(r.postedAt, rfPosted)) return false;
      }
      if (rfStatus.trim() && !columnFilterIncludes(formatRevenueStatus(r.status, t), rfStatus)) return false;
      return true;
    });
  }, [rows, rfCategory, rfNet, rfPosted, rfStatus, rfClinic, i18n.language, t]);

  const breakdownRows = useMemo(() => {
    const items = bd.data?.items ?? [];
    if (!filterClinicId) return items;
    return items.filter((r) => r.clinicId === filterClinicId);
  }, [bd.data?.items, filterClinicId]);

  const revenueCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const item of series.data?.items ?? []) {
      for (const row of item.revenueByCurrency) {
        if (Math.abs(row.amount) > 0.0001) set.add(row.currency);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [series.data?.items]);

  const chartData = useMemo(() => {
    return (series.data?.items ?? []).map((item) => {
      const row: Record<string, string | number> = {
        month: item.month,
        visits: item.visits,
      };
      for (const currency of revenueCurrencies) {
        row[`revenue_${currency}`] =
          item.revenueByCurrency.find((r) => r.currency === currency)?.amount ?? 0;
      }
      return row;
    });
  }, [series.data?.items, revenueCurrencies]);

  const clinicBarData = useMemo(
    () =>
      breakdownRows.map((r) => ({
        name: formatClinicName({ nameEn: r.nameEn, nameAr: r.nameAr }, i18n.language),
        net: r.netTotal,
        gross: r.grossTotal,
      })),
    [breakdownRows, i18n.language],
  );

  return (
    <div className="space-y-6">
      <ValidationIssuesDialog {...validation.dialogProps} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("revenue.title")}</h1>
        <p className="text-muted-foreground">{t("revenue.subtitle")}</p>
      </div>
      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium">{t("revenue.reportingPeriod", "Reporting period")}</CardTitle>
          <CardDescription className="text-xs">
            {t(
              "revenue.reportingPeriodHint",
              "Date range and clinic scope apply automatically to totals, tables, and charts.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className={`${filterToolbarClassName} pb-4`}>
          <div className={filterFieldClassName}>
            <Label className="text-xs">{t("dateRange.from")}</Label>
            <Input
              className="ltr-nums"
              type="date"
              value={from}
              onChange={(e) => {
                setRange(e.target.value, to);
                setPage(1);
              }}
            />
          </div>
          <div className={filterFieldClassName}>
            <Label className="text-xs">{t("common.to", "To")}</Label>
            <Input
              className="ltr-nums"
              type="date"
              value={to}
              onChange={(e) => {
                setRange(from, e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className={filterFieldClassName}>
            <Label className="text-xs">{t("revenue.ledgerClinicFilter", "Clinic scope")}</Label>
            {singleManagedClinic ? (
              <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-2 text-sm">
                {formatClinicName(singleManagedClinic, i18n.language)}
              </p>
            ) : (
              <select
                className={nativeSelectClassName}
                value={filterClinicId}
                onChange={(e) => {
                  setFilterClinicId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("revenue.allClinicsOrganization", "All clinics (organization)")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClinicName(c, i18n.language)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={filterActionsClassName}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 w-full min-[420px]:w-auto"
              onClick={() => {
                resetToCurrentMonth();
                setPage(1);
                void qc.invalidateQueries();
              }}
            >
              {t("revenue.thisMonth", "This month")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid gap-3",
          canPostRevenue ? "lg:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] lg:items-start" : "grid-cols-1",
        )}
      >
        {canPostRevenue ? (
          <Card className="min-w-0">
            <CardHeader className="space-y-1 pb-2 pt-3">
              <CardTitle className="text-sm font-semibold">{t("revenue.post")}</CardTitle>
              <CardDescription className="text-[11px] leading-snug">
                {t("revenue.postHint", "Post encounter or operation payments for the selected clinic.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pb-3">
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label>{t("revenue.linkOperation", "Link to operation (optional)")}</Label>
                <select
                  className={nativeSelectClassName}
                  value={operationId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setOperationId(id);
                    if (id) {
                      const op = payableOps.find((o) => o.id === id);
                      if (op) {
                        setClinicId(op.clinicId);
                        const balance = op.balanceDue ?? 0;
                        setGross(String(balance));
                        setVatPercent("");
                      }
                    }
                  }}
                >
                  <option value="">{t("revenue.noOperation", "No operation — general revenue")}</option>
                  {payableOps.map((o) => {
                    const patient = resolvePatientListLabel({
                      patientId: o.patientId,
                      patientMrn: o.patientMrn,
                      patientName: o.patientName,
                    }).text;
                    const balance = o.balanceDue ?? o.totalCost - (o.paidAmount ?? 0);
                    return (
                      <option key={o.id} value={o.id}>
                        {patient} · {new Date(o.operationDate).toLocaleDateString(localeForLanguage(i18n.language))} ·{" "}
                        {money(balance)} {t("operations.balanceDue", "Balance")}
                      </option>
                    );
                  })}
                </select>
                {selectedOperation ? (
                  <p className="text-xs text-muted-foreground">
                    {t("revenue.operationBalanceHint", {
                      amount: money(operationBalance),
                      defaultValue: "Remaining balance: {{amount}}",
                    })}
                    {" · "}
                    {t("revenue.operationPaymentHint", "Payment amount will update the operation paid total.")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label required>{t("revenue.clinic")}</Label>
                {singleManagedClinic ? (
                  <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                    {formatClinicName(singleManagedClinic, i18n.language)}
                  </p>
                ) : (
                  <select
                    className={nativeSelectClassName}
                    value={clinicId}
                    onChange={(e) => {
                      setClinicId(e.target.value);
                      setRevenueCurrency(resolveClinicCurrency(e.target.value || undefined));
                    }}
                  >
                    <option value="">{t("revenue.pickClinic")}</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClinicName(c, i18n.language)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("revenue.category")}</Label>
                <select
                  className={nativeSelectClassName}
                  value={operationId ? "OPERATION_PAYMENT" : category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={operationId.length > 0}
                >
                  <option value="VISIT_FEE">{t("revenue.categories.ENCOUNTER", "Encounter")}</option>
                  <option value="OPERATION_PAYMENT">{t("revenue.categories.OPERATION", "Operation")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("revenue.currency", "Currency")}</Label>
                <BaseCurrencySelect value={revenueCurrency} onChange={setRevenueCurrency} />
              </div>
              <div className="space-y-2">
                <Label required>{t("revenue.gross", "Gross ({{currency}})", { currency: revenueCurrency })}</Label>
                <Input
                  className="ltr-nums"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("revenue.vatPercent", "VAT %")}</Label>
                <Input
                  className="ltr-nums"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(e.target.value)}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("revenue.net", "Net ({{currency}})", { currency: revenueCurrency })}</Label>
                <Input
                  className="ltr-nums bg-muted/50"
                  readOnly
                  value={gross.trim() ? money(netComputed, revenueCurrency) : ""}
                  type="text"
                />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <CreateActionButton type="button" disabled={createMut.isPending} onClick={handleSubmitRevenue}>
                  {t("revenue.submit")}
                </CreateActionButton>
              </div>
              {validation.formErr ? (
                <p className="text-sm text-destructive sm:col-span-full">{validation.formErr}</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex min-w-0 flex-col gap-2">
          <Card className="border-emerald-200/70 bg-gradient-to-r from-emerald-50/80 to-transparent dark:border-emerald-900/50 dark:from-emerald-950/30">
            <CardContent className="flex items-center gap-3 py-3 pe-4 ps-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                <ArrowUpRight className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/80 dark:text-emerald-300/90">
                  {t("revenue.totalGross", "Total gross")}
                </p>
                <p className="truncate text-base font-semibold text-emerald-800 ltr-nums dark:text-emerald-300 sm:text-lg">
                  {totalsQ.isPending ? "—" : formatLedgerTotals(totalsQ.data, "grossTotal", displayCurrency, locale)}
                </p>
              </div>
              <CircleDollarSign className="size-5 shrink-0 text-emerald-600/40 dark:text-emerald-400/40" aria-hidden />
            </CardContent>
          </Card>
          <Card className="border-sky-200/70 bg-gradient-to-r from-sky-50/80 to-transparent dark:border-sky-900/50 dark:from-sky-950/30">
            <CardContent className="flex items-center gap-3 py-3 pe-4 ps-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-600/15 text-sky-700 dark:text-sky-400">
                <ArrowDownLeft className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800/80 dark:text-sky-300/90">
                  {t("revenue.totalNet", "Total net")}
                </p>
                <p className="truncate text-base font-semibold text-sky-800 ltr-nums dark:text-sky-300 sm:text-lg">
                  {totalsQ.isPending ? "—" : formatLedgerTotals(totalsQ.data, "netTotal", displayCurrency, locale)}
                </p>
              </div>
              <CircleDollarSign className="size-5 shrink-0 text-sky-600/40 dark:text-sky-400/40" aria-hidden />
            </CardContent>
          </Card>
        </div>
      </div>

      

      {receivableRows.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("revenue.outstandingBalances", "Outstanding balances")}</CardTitle>
            <CardDescription className="text-xs">
              {t(
                "revenue.outstandingBalancesHint",
                "Receivable visit fees and other balances owed — collect from the visit or front desk; excluded from posted revenue above.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("revenue.clinic", "Clinic")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("revenue.category", "Category")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("revenue.net", "Net")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("revenue.status", "Status")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("revenue.description", "Description")}</th>
                  </tr>
                </thead>
                <tbody>
                  {receivableRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">{clinicDisplayName(r, i18n.language)}</td>
                      <td className="px-3 py-2">{formatRevenueLedgerCategory(r.category, t, r.description)}</td>
                      <td className="px-3 py-2 ltr-nums">{money(r.netAmount, r.currency)}</td>
                      <td className="px-3 py-2">{formatRevenueStatus(r.status, t)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className={cn(featureTabsListClassName, "max-w-md grid-cols-2")}>
          <TabsTrigger value="tables" className={featureTabTriggerClassName("sky")}>
            <Table2 className="size-4 shrink-0" aria-hidden />
            {t("revenue.tabTables", "Tables")}
          </TabsTrigger>
          <TabsTrigger value="charts" className={featureTabTriggerClassName("violet")}>
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            {t("revenue.tabCharts", "Charts")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="space-y-6 focus-visible:outline-none">
          {breakdownEnabled ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("revenue.byClinicTitle", "Posted revenue by clinic")}</CardTitle>
                <CardDescription className="ltr-nums">
                  {t("revenue.byClinicSubtitle", "Same reporting period as above.")}{" "}
                  {t("revenue.grandGross", "Gross")}: {money(bd.data?.grandGross ?? 0)} ·{" "}
                  {t("revenue.grandNet", "Net")}: {money(bd.data?.grandNet ?? 0)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bd.isError ? (
                  <p className="text-sm text-destructive">
                    {bd.error instanceof Error ? bd.error.message : t("common.error")}
                  </p>
                ) : bd.isPending ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : (
                  <ResponsiveTable>
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">{t("revenue.clinic")}</th>
                          <th className="px-3 py-2 text-start font-medium">{t("revenue.totalGross", "Gross")}</th>
                          <th className="px-3 py-2 text-start font-medium">{t("revenue.totalNet", "Net")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownRows.map((r) => (
                          <tr key={r.clinicId} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">
                              {formatClinicName({ nameEn: r.nameEn, nameAr: r.nameAr }, i18n.language)}
                            </td>
                            <td className="px-3 py-2 ltr-nums text-muted-foreground">{money(r.grossTotal)}</td>
                            <td className="px-3 py-2 ltr-nums">{money(r.netTotal)}</td>
                          </tr>
                        ))}
                        {!breakdownRows.length ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                              {t("revenue.noBreakdownRows", "No posted revenue in this range.")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </ResponsiveTable>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t("revenue.ledger")}</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={
                  !rfCategory.trim() && !rfNet.trim() && !rfPosted.trim() && !rfStatus.trim() && !rfClinic.trim()
                }
                onClick={() => {
                  setRfCategory("");
                  setRfNet("");
                  setRfPosted("");
                  setRfStatus("");
                  setRfClinic("");
                }}
              >
                {t("patients.clearColFilters", "Clear column filters")}
              </Button>
            </CardHeader>
            <CardContent>
              <ResponsiveTable>
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <FilterTh label={t("revenue.clinic")} value={rfClinic} onChange={setRfClinic} />
                      <SortableTh
                        label={t("revenue.category")}
                        column="category"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={onSort}
                        filterValue={rfCategory}
                        onFilterChange={setRfCategory}
                      />
                      <SortableTh
                        label={t("revenue.net")}
                        column="netAmount"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={onSort}
                        filterValue={rfNet}
                        onFilterChange={setRfNet}
                      />
                      <SortableTh
                        label={t("revenue.posted")}
                        column="postedAt"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={onSort}
                        filterValue={rfPosted}
                        onFilterChange={setRfPosted}
                      />
                      <SortableTh
                        label={t("revenue.status", "Status")}
                        column="status"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={onSort}
                        filterValue={rfStatus}
                        onFilterChange={setRfStatus}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {isPending ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          {t("common.loading")}
                        </td>
                      </tr>
                    ) : null}
                    {!isPending &&
                      filteredRevenueRows.map((r) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-t border-border hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetail(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDetail(r);
                            }
                          }}
                        >
                          <td
                            className="max-w-[14rem] truncate px-3 py-2 font-medium"
                            title={clinicDisplayName(r, i18n.language)}
                          >
                            {clinicDisplayName(r, i18n.language)}
                          </td>
                          <td className="px-3 py-2">
                            {formatRevenueLedgerCategory(r.category, t, r.description)}
                          </td>
                          <td className="px-3 py-2 ltr-nums">{money(r.netAmount, r.currency)}</td>
                          <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                            {new Date(r.postedAt).toLocaleString(localeForLanguage(i18n.language))}
                          </td>
                          <td className="px-3 py-2 text-xs">{formatRevenueStatus(r.status, t)}</td>
                        </tr>
                      ))}
                    {!isPending && rows.length > 0 && filteredRevenueRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          {t("patients.noColMatch", "No rows match the column filters.")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </ResponsiveTable>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={revTotal}
                totalPages={revTotalPages}
                disabled={isPending}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="space-y-6 focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {revenueCurrencies.length === 1
                  ? t("reports.chartRevenueCurrency", "Posted revenue ({{currency}})", {
                      currency: revenueCurrencies[0],
                    })
                  : t("reports.chartRevenueMulti", "Posted revenue by currency")}
              </CardTitle>
              <CardDescription>
                {t(
                  "revenue.chartsHint",
                  "Posted revenue for the reporting period — only currencies with activity for this organization.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {series.isPending ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : series.isError ? (
                <p className="text-sm text-destructive">
                  {series.error instanceof Error ? series.error.message : t("common.error")}
                </p>
              ) : revenueCurrencies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("revenue.noBreakdownRows", "No posted revenue in this range.")}
                </p>
              ) : (
                <div className="h-64 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <ChartTooltip
                        formatter={(value: number, name: string) => {
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
                </div>
              )}
            </CardContent>
          </Card>

          {revenueCurrencies.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("revenue.chartStackedByCurrency", "Monthly revenue by currency")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <ChartTooltip
                        formatter={(value: number, name: string) => {
                          const currency = String(name).replace(/^revenue_/, "");
                          return [money(Number(value), currency), `${t("nav.revenue")} (${currency})`];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {revenueCurrencies.map((currency, index) => {
                        const color = currencyChartColor(index);
                        return (
                          <Area
                            key={currency}
                            type="monotone"
                            dataKey={`revenue_${currency}`}
                            name={`${t("nav.revenue")} (${currency})`}
                            stroke={color}
                            fill={color}
                            fillOpacity={0.22}
                            strokeWidth={2}
                            stackId="rev"
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {breakdownEnabled && clinicBarData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("revenue.chartByClinic", "Net posted revenue by clinic")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clinicBarData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => money(Number(v))} />
                      <ChartTooltip formatter={(value: number) => [money(Number(value)), t("revenue.totalNet", "Total net")]} />
                      <Bar dataKey="net" name={t("revenue.totalNet", "Total net")} fill={currencyChartColor(0)} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <DoctorStatementsCard manage />

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("revenue.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.clinic")}</dt>
                <dd className="font-medium">{clinicDisplayName(detail, i18n.language)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.category")}</dt>
                <dd className="font-medium">
                  {formatRevenueLedgerCategory(detail.category, t, detail.description)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.status")}</dt>
                <dd className="font-medium">{formatRevenueStatus(detail.status, t)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.gross")}</dt>
                <dd className="font-medium ltr-nums">{money(detail.grossAmount, detail.currency)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.tax")}</dt>
                <dd className="font-medium ltr-nums">{money(detail.taxAmount, detail.currency)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.net")}</dt>
                <dd className="font-medium ltr-nums">{money(detail.netAmount, detail.currency)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.posted")}</dt>
                <dd className="font-medium ltr-nums">
                  {new Date(detail.postedAt).toLocaleString(localeForLanguage(i18n.language))}
                </dd>
              </div>
              {detail.description?.trim() ? (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.description")}</dt>
                  <dd className="font-medium">{detail.description}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("revenue.entryId")}</dt>
                <dd className="font-mono text-xs text-muted-foreground">{detail.id}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
