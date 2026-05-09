import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpisQuery } from "@/lib/api-hooks";

const TREND = [
  { m: "Jan", income: 1.2, expense: 0.72 },
  { m: "Feb", income: 1.28, expense: 0.76 },
  { m: "Mar", income: 1.35, expense: 0.8 },
  { m: "Apr", income: 1.42, expense: 0.83 },
  { m: "May", income: 1.55, expense: 0.88 },
  { m: "Jun", income: 1.48, expense: 0.86 },
  { m: "Jul", income: 1.62, expense: 0.91 },
  { m: "Aug", income: 1.7, expense: 0.94 },
  { m: "Sep", income: 1.66, expense: 0.92 },
  { m: "Oct", income: 1.78, expense: 0.97 },
  { m: "Nov", income: 1.84, expense: 1.0 },
  { m: "Dec", income: 1.9, expense: 1.02 },
];

function formatMoney(n: number, lng: string) {
  return new Intl.NumberFormat(lng === "ar" ? "ar-AE" : "en-AE", {
    style: "currency",
    currency: "AED",
    notation: n >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const home = defaultHomeForRole(role, navTabKeys);
  if (home !== "/") {
    return <Navigate to={home} replace />;
  }
  const { data, isPending, isError, error } = useDashboardKpisQuery();

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
        <KpiCard
          label={t("dashboard.kpi.patients")}
          value={data?.patients}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
        <KpiCard
          label={t("dashboard.kpi.encountersPeriod", "Encounters (period)")}
          value={data?.encountersPeriodTotal ?? data?.encounters30d}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
        <KpiCard
          label={t("dashboard.kpi.appointmentsPeriod", "Appointments (period)")}
          value={data?.appointmentsPeriodTotal}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
        <KpiCard
          label={t("dashboard.kpi.branches")}
          value={data?.branches}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
        <KpiCard
          label={t("dashboard.kpi.headcount")}
          value={data?.headcount}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
        <KpiCard
          label={t("dashboard.kpi.employees")}
          value={data?.employeeCount}
          loading={isPending}
          lng={i18n.language}
          format="int"
        />
      </div>

      {!isError ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("nav.revenue")} vs {t("nav.expenses")}
            </CardTitle>
            <CardDescription>{t("dashboard.chartPlaceholder")}</CardDescription>
          </CardHeader>
          <CardContent className="h-72 ps-0">
            <div className="h-full w-full min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TREND} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(200 85% 32%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(200 85% 32%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(215 16% 40%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(215 16% 40%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs ltr-nums"
                    width={40}
                    tickFormatter={(v) => `${v}M`}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8 }}
                    formatter={(value: number, name) => [
                      `${value.toFixed(2)}M AED`,
                      name === "income" ? t("nav.revenue") : t("nav.expenses"),
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="hsl(200 85% 32%)"
                    fill="url(#fillIncome)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="hsl(215 16% 40%)"
                    fill="url(#fillExpense)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  lng,
  format,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  lng: string;
  format: "int" | "money";
}) {
  const display =
    value === undefined || loading
      ? "—"
      : format === "money"
        ? formatMoney(value, lng)
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
