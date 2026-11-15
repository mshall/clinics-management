import { Info, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { useAdminInsights360Query, useAdminStaffPerformanceQuery } from "@/lib/support-hooks";
import type { StaffPerformanceDto } from "@/lib/support-types";
import { formatUserRole } from "@/lib/locale-display";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { columnFilterIncludes } from "@/lib/utils";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type StaffRow = StaffPerformanceDto["staff"][number];

type SortKey =
  | "staff"
  | "role"
  | "encountersCreated"
  | "encountersPerformed"
  | "appointmentsCreated"
  | "appointmentsPerformed"
  | "operationsCreated"
  | "operationsPerformed";

const ROLE_STAR_ORDER = [
  "physician",
  "nurse",
  "receptionist",
  "clinic_assistant",
  "branch_manager",
  "clinic_admin",
  "group_supervisor",
  "group_admin",
  "call_center",
  "finance_officer",
  "hr_officer",
] as const;

function staffDisplayName(row: StaffRow): string {
  return (row.displayName?.trim() || row.email).trim();
}

function scoreColorClass(score: number, min: number, max: number): string {
  if (max <= min) return "text-muted-foreground";
  const ratio = (score - min) / (max - min);
  if (ratio >= 0.66) return "font-semibold text-emerald-600 dark:text-emerald-400";
  if (ratio >= 0.33) return "font-semibold text-amber-600 dark:text-amber-400";
  return "font-medium text-muted-foreground";
}

function HeaderInfo({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="min-w-0 truncate">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={tip}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[16rem] text-start leading-snug">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function metricForSort(row: StaffRow, key: SortKey): number | string {
  if (key === "staff") return staffDisplayName(row).toLowerCase();
  if (key === "role") return row.role;
  return row.metrics[key as keyof StaffRow["metrics"]] ?? 0;
}

export function OrgInsightsPanel() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);
  const [staffQuery, setStaffQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("staff");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const overview = useAdminInsights360Query(rangeFrom, rangeTo);
  const staff = useAdminStaffPerformanceQuery(rangeFrom, rangeTo);

  const vol = overview.data?.volumes;
  const staffRows = staff.data?.staff ?? [];

  const scoreBounds = useMemo(() => {
    const scores = staffRows.map((r) => r.metrics.activityScore);
    if (!scores.length) return { min: 0, max: 0 };
    return { min: Math.min(...scores), max: Math.max(...scores) };
  }, [staffRows]);

  const roleOptions = useMemo(() => {
    const set = new Set(staffRows.map((r) => r.role));
    return [...set].sort();
  }, [staffRows]);

  const filteredRows = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return staffRows.filter((row) => {
      if (roleFilter && row.role !== roleFilter) return false;
      if (!q) return true;
      const hay = `${staffDisplayName(row)} ${row.role}`.toLowerCase();
      return columnFilterIncludes(hay, q);
    });
  }, [staffRows, staffQuery, roleFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = metricForSort(a, sortBy);
      const bv = metricForSort(b, sortBy);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, sortBy, sortOrder]);

  const roleStars = useMemo(() => {
    const byRole = new Map<string, StaffRow>();
    for (const row of staffRows) {
      const cur = byRole.get(row.role);
      if (!cur || row.metrics.activityScore > cur.metrics.activityScore) byRole.set(row.role, row);
    }
    const roles = [...byRole.keys()].sort((a, b) => {
      const ia = ROLE_STAR_ORDER.indexOf(a as (typeof ROLE_STAR_ORDER)[number]);
      const ib = ROLE_STAR_ORDER.indexOf(b as (typeof ROLE_STAR_ORDER)[number]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return roles.map((role) => ({ role, winner: byRole.get(role)! }));
  }, [staffRows]);

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy as SortKey);
    setSortOrder(next.sortOrder);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.insights.period", "Reporting period")}</CardTitle>
            <CardDescription>{t("admin.insights.periodHint", "Default window is the last 30 days.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="insights-from">{t("admin.insights.from", "From")}</Label>
              <Input id="insights-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-auto" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="insights-to">{t("admin.insights.to", "To")}</Label>
              <Input id="insights-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-auto" />
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => {
                setRangeFrom(from);
                setRangeTo(to);
              }}
            >
              {t("patients.applyFilters", "Apply")}
            </Button>
          </CardContent>
        </Card>

        {overview.isError ? (
          <p className="text-sm text-destructive">
            {overview.error instanceof Error ? overview.error.message : t("common.error")}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label={t("admin.insights.openTickets", "Open support tickets")} value={vol?.openSupportTickets} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.patientsCreated", "Patients registered")} value={vol?.patientsCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.encountersCreated", "Encounters")} value={vol?.encountersCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.appointmentsCreated", "Appointments")} value={vol?.appointmentsCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.expensesCreated", "Expenses logged")} value={vol?.expensesCreated} loading={overview.isPending} />
        </div>

        {roleStars.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("admin.insights.roleStarsTitle", "Top performer by role")}</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              {t(
                "admin.insights.roleStarsHint",
                "Highest activity score in the selected reporting period. Score color reflects standing in that period (green high, amber mid, gray low).",
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {roleStars.map(({ role, winner }) => (
                <Card
                  key={role}
                  className="overflow-hidden border-amber-200/50 shadow-sm transition-shadow hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 dark:border-amber-900/40"
                >
                  <CardContent className="flex items-start gap-2.5 p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/50">
                      <Trophy
                        className="size-5 text-amber-500 motion-safe:animate-[pulse_2.2s_ease-in-out_infinite]"
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        {t("admin.insights.topRoleTitle", "Top {{role}}", { role: formatUserRole(role, t) })}
                      </p>
                      <p className="truncate text-sm font-semibold leading-tight">{staffDisplayName(winner)}</p>
                      <p
                        className={`mt-0.5 text-xs ltr-nums ${scoreColorClass(
                          winner.metrics.activityScore,
                          scoreBounds.min,
                          scoreBounds.max,
                        )}`}
                      >
                        {t("admin.insights.periodScore", "Score {{score}}", { score: winner.metrics.activityScore })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.insights.staffTitle", "Staff performance")}</CardTitle>
            <CardDescription>
              {t(
                "admin.insights.staffSubtitle",
                "All staff in your scope for the period. Created counts come from who logged the record; performed counts are the assigned clinician on encounters, appointments, and operations.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {staff.isError ? (
              <p className="text-sm text-destructive">
                {staff.error instanceof Error ? staff.error.message : t("common.error")}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
                <Label htmlFor="staff-insights-search">{t("admin.insights.staffSearch", "Search staff")}</Label>
                <Input
                  id="staff-insights-search"
                  value={staffQuery}
                  onChange={(e) => setStaffQuery(e.target.value)}
                  placeholder={t("admin.insights.staffSearchPh", "Name or role…")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-insights-role">{t("admin.insights.staffRoleFilter", "Role")}</Label>
                <select
                  id="staff-insights-role"
                  className={`w-full sm:w-48 ${nativeSelectClassName}`}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">{t("admin.insights.staffRoleAll", "All roles")}</option>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {formatUserRole(r, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!staff.isPending ? (
              <p className="text-xs text-muted-foreground">
                {t("admin.insights.staffCount", "{{count}} staff", { count: sortedRows.length })}
              </p>
            ) : null}
            <ResponsiveTable>
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <SortableTh
                      label={t("admin.insights.colStaff", "Staff")}
                      column="staff"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                    <SortableTh
                      label={t("admin.insights.colRole", "Role")}
                      column="role"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colEncountersCreated", "Created encounters")}
                          tip={t(
                            "admin.insights.tipEncountersCreated",
                            "Encounter records this user created (audit), not necessarily the clinician who performed the visit.",
                          )}
                        />
                      }
                      column="encountersCreated"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colEncountersPerformed", "Performed encounters")}
                          tip={t(
                            "admin.insights.tipEncountersPerformed",
                            "Encounters where this user is the assigned clinician (doctor who performed the visit).",
                          )}
                        />
                      }
                      column="encountersPerformed"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colApptsCreated", "Created appointments")}
                          tip={t(
                            "admin.insights.tipApptsCreated",
                            "Appointments this user created in the system (audit).",
                          )}
                        />
                      }
                      column="appointmentsCreated"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colApptsPerformed", "Performed appointments")}
                          tip={t(
                            "admin.insights.tipApptsPerformed",
                            "Appointments where this user is the assigned clinician.",
                          )}
                        />
                      }
                      column="appointmentsPerformed"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colOpsCreated", "Created operations")}
                          tip={t(
                            "admin.insights.tipOpsCreated",
                            "Surgeries/operations this user scheduled or logged (creator).",
                          )}
                        />
                      }
                      column="operationsCreated"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colOpsPerformed", "Performed operations")}
                          tip={t(
                            "admin.insights.tipOpsPerformed",
                            "Operations where this user is the assigned surgeon/clinician.",
                          )}
                        />
                      }
                      column="operationsPerformed"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.userId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{staffDisplayName(row)}</div>
                        {!row.active ? (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {t("admin.insights.inactive", "Inactive")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatUserRole(row.role, t)}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.encountersCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.encountersPerformed}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.appointmentsCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.appointmentsPerformed}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.operationsCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.operationsPerformed}</td>
                    </tr>
                  ))}
                  {!staff.isPending && !sortedRows.length ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        {t("admin.insights.staffEmpty", "No staff metrics for this period.")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTable>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold ltr-nums">{loading ? "…" : (value ?? 0).toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}