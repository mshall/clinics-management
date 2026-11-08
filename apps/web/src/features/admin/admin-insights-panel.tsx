import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminInsights360Query, useAdminStaffPerformanceQuery } from "@/lib/support-hooks";
import { formatUserRole } from "@/lib/locale-display";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AdminInsightsPanel() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);

  const overview = useAdminInsights360Query(rangeFrom, rangeTo);
  const staff = useAdminStaffPerformanceQuery(rangeFrom, rangeTo);

  const vol = overview.data?.volumes;
  const staffRows = useMemo(() => {
    const rows = staff.data?.staff ?? [];
    return [...rows].sort((a, b) => b.metrics.activityScore - a.metrics.activityScore);
  }, [staff.data?.staff]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.insights.period", "Reporting period")}</CardTitle>
          <CardDescription>{t("admin.insights.periodHint", "Default window is the last 30 days.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="insights-from">{t("admin.insights.from", "From")}</Label>
            <Input id="insights-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="insights-to">{t("admin.insights.to", "To")}</Label>
            <Input id="insights-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            type="button"
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
        <MetricCard
          label={t("admin.insights.auditEvents", "Audit events")}
          value={vol?.auditEvents}
          loading={overview.isPending}
        />
        <MetricCard
          label={t("admin.insights.openTickets", "Open support tickets")}
          value={vol?.openSupportTickets}
          loading={overview.isPending}
        />
        <MetricCard
          label={t("admin.insights.patientsCreated", "Patients registered")}
          value={vol?.patientsCreated}
          loading={overview.isPending}
        />
        <MetricCard
          label={t("admin.insights.encountersCreated", "Encounters")}
          value={vol?.encountersCreated}
          loading={overview.isPending}
        />
        <MetricCard
          label={t("admin.insights.appointmentsCreated", "Appointments")}
          value={vol?.appointmentsCreated}
          loading={overview.isPending}
        />
        <MetricCard
          label={t("admin.insights.expensesCreated", "Expenses logged")}
          value={vol?.expensesCreated}
          loading={overview.isPending}
        />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.insights.staffTitle", "Staff performance")}</CardTitle>
          <CardDescription>
            {t(
              "admin.insights.staffSubtitle",
              "Activity scores combine audit actions, clinical throughput, and open ticket workload.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.isError ? (
            <p className="text-sm text-destructive">
              {staff.error instanceof Error ? staff.error.message : t("common.error")}
            </p>
          ) : null}
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.insights.colStaff", "Staff")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.insights.colRole", "Role")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("admin.insights.colScore", "Score")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("admin.insights.colAudit", "Audit")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("admin.insights.colEncounters", "Enc.")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("admin.insights.colAppts", "Appts")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("admin.insights.colTickets", "Tickets")}</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((row) => (
                  <tr key={row.userId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.displayName || row.email}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
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
                    <td className="px-3 py-2 text-end ltr-nums">{row.metrics.appointmentsHandled}</td>
                    <td className="px-3 py-2 text-end ltr-nums">{row.metrics.openSupportTickets}</td>
                  </tr>
                ))}
                {!staff.isPending && !staffRows.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
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
