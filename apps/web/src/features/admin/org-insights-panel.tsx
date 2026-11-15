import {
  Building2,
  ClipboardList,
  Eye,
  Headset,
  HeartPulse,
  Info,
  Phone,
  Settings,
  Shield,
  Stethoscope,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
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
  | "activityScore"
  | "auditActions"
  | "encountersCreated"
  | "encountersPerformed"
  | "appointmentsCreated"
  | "appointmentsPerformed"
  | "operationsCreated"
  | "operationsPerformed"
  | "openSupportTickets";

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

function roleStarIcon(role: string): ReactNode {
  const cls = "size-8 text-primary";
  switch (role) {
    case "physician":
      return <Stethoscope className={cls} aria-hidden />;
    case "nurse":
      return <HeartPulse className={cls} aria-hidden />;
    case "receptionist":
      return <Headset className={cls} aria-hidden />;
    case "clinic_assistant":
      return <ClipboardList className={cls} aria-hidden />;
    case "branch_manager":
      return <Building2 className={cls} aria-hidden />;
    case "clinic_admin":
      return <Settings className={cls} aria-hidden />;
    case "group_supervisor":
      return <Eye className={cls} aria-hidden />;
    case "group_admin":
      return <Shield className={cls} aria-hidden />;
    case "call_center":
      return <Phone className={cls} aria-hidden />;
    case "finance_officer":
      return <Wallet className={cls} aria-hidden />;
    case "hr_officer":
      return <Users className={cls} aria-hidden />;
    default:
      return <Users className={cls} aria-hidden />;
  }
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
  if (key === "staff") return (row.displayName || row.email).toLowerCase();
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
  const [sortBy, setSortBy] = useState<SortKey>("activityScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const overview = useAdminInsights360Query(rangeFrom, rangeTo);
  const staff = useAdminStaffPerformanceQuery(rangeFrom, rangeTo);

  const vol = overview.data?.volumes;
  const staffRows = staff.data?.staff ?? [];

  const roleOptions = useMemo(() => {
    const set = new Set(staffRows.map((r) => r.role));
    return [...set].sort();
  }, [staffRows]);

  const filteredRows = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return staffRows.filter((row) => {
      if (roleFilter && row.role !== roleFilter) return false;
      if (!q) return true;
      const hay = `${row.displayName} ${row.email} ${row.role}`.toLowerCase();
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
    return ROLE_STAR_ORDER.filter((r) => byRole.has(r)).map((role) => ({ role, winner: byRole.get(role)! }));
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
          <MetricCard label={t("admin.insights.auditEvents", "Audit events")} value={vol?.auditEvents} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.openTickets", "Open support tickets")} value={vol?.openSupportTickets} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.patientsCreated", "Patients registered")} value={vol?.patientsCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.encountersCreated", "Encounters")} value={vol?.encountersCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.appointmentsCreated", "Appointments")} value={vol?.appointmentsCreated} loading={overview.isPending} />
          <MetricCard label={t("admin.insights.expensesCreated", "Expenses logged")} value={vol?.expensesCreated} loading={overview.isPending} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.insights.topActions", "Top actions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {(overview.data?.topActions ?? []).map((a) => (
                  <li key={a.action} className="flex justify-between gap-2 border-b border-border py-1">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-muted-foreground ltr-nums">{a.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.insights.topResources", "Top resources")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {(overview.data?.topResources ?? []).map((r) => (
                  <li key={r.resource} className="flex justify-between gap-2 border-b border-border py-1">
                    <span className="font-medium">{r.resource}</span>
                    <span className="text-muted-foreground ltr-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {roleStars.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("admin.insights.roleStarsTitle", "Top performer by role")}</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              {t("admin.insights.roleStarsHint", "Highest activity score in the selected reporting period, one star per role.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roleStars.map(({ role, winner }) => (
                <Card key={role} className="overflow-hidden border-amber-200/60 dark:border-amber-900/40">
                  <CardContent className="flex gap-3 p-4">
                    <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50">
                      {roleStarIcon(role)}
                      <Trophy className="absolute -end-1 -top-1 size-5 text-amber-500" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                        {t("admin.insights.roleStarBadge", "Star of the period")}
                      </p>
                      <p className="truncate text-sm font-semibold">{winner.displayName || winner.email}</p>
                      <p className="text-xs text-muted-foreground">{formatUserRole(role, t)}</p>
                      <p className="mt-1 text-xs ltr-nums text-muted-foreground">
                        {t("admin.insights.colScore", "Score")}: {winner.metrics.activityScore}
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
                "Created counts come from who logged the record; performed counts are the assigned clinician (doctor) on encounters, appointments, and operations.",
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
                  placeholder={t("admin.insights.staffSearchPh", "Name, email, or role…")}
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
            <ResponsiveTable>
              <table className="w-full min-w-[1100px] text-sm">
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
                          label={t("admin.insights.colScore", "Score")}
                          tip={t("admin.insights.tipScore", "Weighted activity score for the reporting period.")}
                        />
                      }
                      column="activityScore"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
                    />
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colAudit", "Audit")}
                          tip={t("admin.insights.tipAudit", "Audit log events attributed to this user.")}
                        />
                      }
                      column="auditActions"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      className="text-end"
                      align="center"
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
                    <SortableTh
                      label={
                        <HeaderInfo
                          label={t("admin.insights.colTickets", "Tickets")}
                          tip={t("admin.insights.tipTickets", "Open support tickets currently assigned to this user.")}
                        />
                      }
                      column="openSupportTickets"
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
                        <div className="font-medium">{row.displayName || row.email}</div>
                        <div className="text-xs text-muted-foreground break-all">{row.email}</div>
                        {!row.active ? (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {t("admin.insights.inactive", "Inactive")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatUserRole(row.role, t)}</td>
                      <td className="px-3 py-2 text-end font-semibold ltr-nums">{row.metrics.activityScore}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.auditActions}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.encountersCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.encountersPerformed}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.appointmentsCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.appointmentsPerformed}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.operationsCreated}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.operationsPerformed}</td>
                      <td className="px-3 py-2 text-end ltr-nums">{row.metrics.openSupportTickets}</td>
                    </tr>
                  ))}
                  {!staff.isPending && !sortedRows.length ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
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