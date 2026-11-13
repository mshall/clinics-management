import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpisQuery, useDashboardTodayQuery } from "@/lib/api-hooks";
import { canViewDashboardFinancialKpis, canViewDashboardHrKpis } from "@/lib/dashboard-kpi-policy";
import { formatMultiCurrencyAmounts } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const home = defaultHomeForRole(role, navTabKeys, roleNavTabKeys);
  const { data, isPending, isError, error } = useDashboardKpisQuery();
  const todayQ = useDashboardTodayQuery();
  const locale = localeForLanguage(i18n.language);
  const todayDateLabel = useMemo(() => {
    const raw = todayQ.data?.date;
    if (!raw) return "";
    const d = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);
  }, [todayQ.data?.date, locale]);
  const showFinancial = canViewDashboardFinancialKpis(role);
  const showHr = canViewDashboardHrKpis(role);

  const revenueDisplay = formatMultiCurrencyAmounts(data?.revenueByCurrency ?? [], locale);
  const expensesDisplay = formatMultiCurrencyAmounts(data?.expensesByCurrency ?? [], locale);
  const netByCurrency = (() => {
    const revenue = new Map((data?.revenueByCurrency ?? []).map((row) => [row.currency, row.amount]));
    const expenses = new Map((data?.expensesByCurrency ?? []).map((row) => [row.currency, row.amount]));
    const currencies = new Set([...revenue.keys(), ...expenses.keys()]);
    return [...currencies]
      .map((currency) => ({
        currency,
        amount: (revenue.get(currency) ?? 0) - (expenses.get(currency) ?? 0),
      }))
      .filter((row) => row.amount !== 0)
      .sort((a, b) => a.currency.localeCompare(b.currency));
  })();
  const netDisplay = formatMultiCurrencyAmounts(netByCurrency, locale);

  if (home !== "/") {
    return <Navigate to={home} replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
        {data?.periodFrom && data?.periodTo ? (
          <p className="mt-1 text-xs text-muted-foreground ltr-nums">
            {t("dashboard.period")}: {data.periodFrom} → {data.periodTo}
          </p>
        ) : null}
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : t("dashboard.loadError")}
        </p>
      ) : null}

      {todayQ.data ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("dashboard.todayLive")}</CardTitle>
            <CardDescription className="ltr-nums">{todayDateLabel}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
            <TodayStat label={t("dashboard.today.appointments")} value={todayQ.data.appointments} locale={locale} />
            <TodayStat label={t("dashboard.today.waiting")} value={todayQ.data.waiting} locale={locale} />
            <TodayStat label={t("dashboard.today.seen")} value={todayQ.data.seen} locale={locale} />
            <TodayStat label={t("dashboard.today.collected")} value={todayQ.data.collected} money locale={locale} />
            <TodayStat label={t("dashboard.today.noShows")} value={todayQ.data.noShows} locale={locale} />
            <TodayStat label={t("dashboard.today.checkedIn")} value={todayQ.data.checkedIn} locale={locale} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label={t("dashboard.kpi.patients")} value={data?.patients} loading={isPending} lng={i18n.language} />
        <KpiCard
          label={t("dashboard.kpi.encountersPeriod", "Encounters (period)")}
          value={data?.encountersPeriodTotal ?? data?.encounters30d}
          loading={isPending}
          lng={i18n.language}
        />
        <KpiCard
          label={t("dashboard.kpi.appointmentsPeriod", "Appointments (period)")}
          value={data?.appointmentsPeriodTotal}
          loading={isPending}
          lng={i18n.language}
        />
        <KpiCard label={t("dashboard.kpi.branches")} value={data?.branches} loading={isPending} lng={i18n.language} />
        {showHr ? (
          <>
            <KpiCard label={t("dashboard.kpi.headcount")} value={data?.headcount} loading={isPending} lng={i18n.language} />
            <KpiCard label={t("dashboard.kpi.employees")} value={data?.employeeCount} loading={isPending} lng={i18n.language} />
          </>
        ) : null}
      </div>

      {showFinancial ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MoneyKpiCard
          label={t("dashboard.kpi.revenuePeriod", "Revenue (period)")}
          display={revenueDisplay}
          loading={isPending}
        />
        <MoneyKpiCard
          label={t("dashboard.kpi.expensesPeriod", "Expenses (period)")}
          display={expensesDisplay}
          loading={isPending}
        />
        <MoneyKpiCard
          label={t("dashboard.kpi.netPeriod", "Net (period)")}
          display={netDisplay}
          loading={isPending}
        />
      </div>
      ) : null}
    </div>
  );
}

function TodayStat({
  label,
  value,
  money,
  locale,
}: {
  label: string;
  value: number;
  money?: boolean;
  locale: string;
}) {
  const display = money
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat(locale).format(value);
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold ltr-nums">{display}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  lng,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  lng: string;
}) {
  const display =
    value === undefined || loading
      ? "—"
      : new Intl.NumberFormat(lng === "ar" ? "ar-AE" : "en-AE").format(value);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl ltr-nums">{display}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function MoneyKpiCard({
  label,
  display,
  loading,
}: {
  label: string;
  display: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg ltr-nums sm:text-2xl">{loading ? "—" : display}</CardTitle>
      </CardHeader>
    </Card>
  );
}
