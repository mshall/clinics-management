import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpisQuery } from "@/lib/api-hooks";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const home = defaultHomeForRole(role, navTabKeys, roleNavTabKeys);
  const { data, isPending, isError, error } = useDashboardKpisQuery();

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
        ? new Intl.NumberFormat(lng === "ar" ? "ar-AE" : "en-AE", {
            style: "currency",
            currency: "AED",
            notation: value >= 1_000_000 ? "compact" : "standard",
            maximumFractionDigits: 1,
          }).format(value)
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
