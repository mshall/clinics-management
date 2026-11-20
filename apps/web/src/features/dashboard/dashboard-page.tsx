import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarDays, CalendarPlus, MonitorUp, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/brand/ui-kit";
import { StatSkeleton } from "@/components/skeleton";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { useDashboardKpisQuery, useDashboardTodayQuery } from "@/lib/api-hooks";
import { canViewDashboardFinancialKpis, canViewDashboardHrKpis } from "@/lib/dashboard-kpi-policy";
import { formatMultiCurrencyAmounts } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { OnboardingChecklistCard } from "@/features/dashboard/onboarding-checklist-card";

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

  const flowTotal = Math.max(todayQ.data?.appointments ?? 0, 1);
  const pct = (n: number) => Math.min(100, Math.round((n / flowTotal) * 100));

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={t("dashboard.title")}
        description={
          <>
            {t("dashboard.subtitle")}
            {data?.periodFrom && data?.periodTo ? (
              <span className="ms-2 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs ltr-nums">{data.periodFrom} → {data.periodTo}</span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/front-desk/board"><MonitorUp className="size-4" />{t("frontDesk.liveBoard", "Live clinic board")}</Link></Button>
            <Button asChild size="sm"><Link to="/appointments"><CalendarPlus className="size-4" />{t("appointments.book", "Book an appointment")}</Link></Button>
          </>
        }
      />
      <OnboardingChecklistCard />

      {isError ? (
        <EmptyState tone="error" compact title={t("dashboard.loadError")} description={error instanceof Error ? error.message : undefined} />
      ) : null}

      {todayQ.data ? (
        <section aria-labelledby="dash-today" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="dash-today" className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="relative inline-flex size-2"><span className="absolute inset-0 rounded-full bg-[hsl(var(--success))] opacity-60 motion-safe:animate-ping" /><span className="relative size-2 rounded-full bg-[hsl(var(--success))]" /></span>{t("dashboard.todayLive")}</h2>
            <span className="text-xs text-muted-foreground ltr-nums">{todayDateLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard tone="brand" label={t("dashboard.today.appointments")} value={fmt(todayQ.data.appointments, locale)} />
            <StatCard tone="info" label={t("dashboard.today.checkedIn")} value={fmt(todayQ.data.checkedIn, locale)} />
            <StatCard tone="warn" label={t("dashboard.today.waiting")} value={fmt(todayQ.data.waiting, locale)} />
            <StatCard tone="good" label={t("dashboard.today.seen")} value={fmt(todayQ.data.seen, locale)} />
            <StatCard tone="bad" label={t("dashboard.today.noShows")} value={fmt(todayQ.data.noShows, locale)} />
            <StatCard tone="good" label={t("dashboard.today.collected")} value={fmt(todayQ.data.collected, locale, true)} />
          </div>
          <div className="space-y-1.5" role="img" aria-label={`${t("dashboard.today.seen")} ${pct(todayQ.data.seen)}%`}>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <span className="bg-[hsl(var(--success))] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct(todayQ.data.seen)}%` }} />
              <span className="bg-[hsl(var(--info))] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct(Math.max(todayQ.data.checkedIn - todayQ.data.seen, 0))}%` }} />
              <span className="bg-[hsl(var(--warning))] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct(todayQ.data.noShows)}%` }} />
            </div>
          </div>
        </section>
      ) : todayQ.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)}</div>
      ) : null}

      <section aria-labelledby="dash-period" className="space-y-3">
        <h2 id="dash-period" className="text-sm font-semibold">{t("dashboard.period", "Reporting period")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label={t("dashboard.kpi.patients")} value={data?.patients} loading={isPending} locale={locale} icon={<Users className="size-4" />} />
          <Kpi label={t("dashboard.kpi.encountersPeriod", "Encounters (period)")} value={data?.encountersPeriodTotal ?? data?.encounters30d} loading={isPending} locale={locale} icon={<Stethoscope className="size-4" />} />
          <Kpi label={t("dashboard.kpi.appointmentsPeriod", "Appointments (period)")} value={data?.appointmentsPeriodTotal} loading={isPending} locale={locale} icon={<CalendarDays className="size-4" />} />
          <Kpi label={t("dashboard.kpi.branches")} value={data?.branches} loading={isPending} locale={locale} icon={<Building2 className="size-4" />} />
          {showHr ? (
            <>
              <Kpi label={t("dashboard.kpi.headcount")} value={data?.headcount} loading={isPending} locale={locale} />
              <Kpi label={t("dashboard.kpi.employees")} value={data?.employeeCount} loading={isPending} locale={locale} />
            </>
          ) : null}
        </div>
      </section>

      {showFinancial ? (
        <section aria-labelledby="dash-money" className="space-y-3">
          <h2 id="dash-money" className="text-sm font-semibold">{t("nav.revenue", "Revenue")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MoneyKpi label={t("dashboard.kpi.revenuePeriod", "Revenue (period)")} display={revenueDisplay} loading={isPending} tone="good" />
            <MoneyKpi label={t("dashboard.kpi.expensesPeriod", "Expenses (period)")} display={expensesDisplay} loading={isPending} tone="warn" />
            <MoneyKpi label={t("dashboard.kpi.netPeriod", "Net (period)")} display={netDisplay} loading={isPending} tone="brand" />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function fmt(value: number, locale: string, money?: boolean) {
  return new Intl.NumberFormat(locale, money ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined).format(value);
}

function Kpi({ label, value, loading, locale, icon }: { label: string; value: number | undefined; loading: boolean; locale: string; icon?: ReactNode }) {
  if (loading || value === undefined) return <StatSkeleton />;
  return <StatCard label={label} value={<span className="ltr-nums">{fmt(value, locale)}</span>} icon={icon} />;
}

function MoneyKpi({ label, display, loading, tone }: { label: string; display: string; loading: boolean; tone: "good" | "warn" | "brand" }) {
  if (loading) return <StatSkeleton />;
  return <StatCard tone={tone} label={label} value={<span className="ltr-nums break-words text-xl sm:text-2xl">{display || "—"}</span>} />;
}
