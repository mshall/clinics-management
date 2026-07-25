import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpisQuery } from "@/lib/api-hooks";
import { formatMultiCurrencyAmounts } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const home = defaultHomeForRole(role, navTabKeys, roleNavTabKeys);
  const { data, isPending, isError, error } = useDashboardKpisQuery();
  const locale = localeForLanguage(i18n.language);

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
          {error instanceof Error ? error.message : "Could not load dashboard."}
        </p>
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
        <KpiCard label={t("dashboard.kpi.headcount")} value={data?.headcount} loading={isPending} lng={i18n.language} />
        <KpiCard label={t("dashboard.kpi.employees")} value={data?.employeeCount} loading={isPending} lng={i18n.language} />
      </div>

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
