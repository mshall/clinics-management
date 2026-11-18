import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOutboxEventsQuery, useAdminOutboxSummaryQuery } from "@/lib/api-hooks";
import { apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";

const STATUSES = ["", "PENDING", "FAILED", "DEAD", "SENT"] as const;

export function AdminGovernanceOutbox() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const summary = useAdminOutboxSummaryQuery();
  const events = useAdminOutboxEventsQuery({
    page,
    pageSize,
    status: statusFilter || undefined,
    type: typeFilter.trim() || undefined,
  });

  const retry = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: boolean }>(`/api/v1/admin/outbox-events/${id}/retry`, {}),
    onSuccess: () => {
      toast.success(t("admin.governanceOutboxRetryOk", "Outbox delivery re-queued"));
      void qc.invalidateQueries({ queryKey: ["admin", "outbox-events"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const rows = events.data?.items ?? [];
  const total = events.data?.total ?? 0;
  const totalPages = events.data?.totalPages ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.governanceTabOutbox", "Outbox")}</CardTitle>
        <CardDescription>
          {t(
            "admin.governanceOutboxSubtitle",
            "Kiorex and tenant webhook events written with domain changes. Retry failed or dead-letter rows.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.data ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">
              {t("admin.governanceOutboxPending", "Pending")}: {summary.data.pending}
            </Badge>
            <Badge variant="outline">
              {t("admin.governanceOutboxFailed", "Failed")}: {summary.data.failed}
            </Badge>
            <Badge variant="outline">
              {t("admin.governanceOutboxDead", "Dead")}: {summary.data.dead}
            </Badge>
            {summary.data.lagAlert ? (
              <Badge variant="default">{t("admin.governanceOutboxLagAlert", "Lag > 2 min")}</Badge>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="outbox-status">{t("admin.governanceOutboxStatusFilter", "Status")}</Label>
            <select
              id="outbox-status"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || t("common.all", "All")}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor="outbox-type">{t("admin.governanceOutboxTypeFilter", "Event type")}</Label>
            <Input
              id="outbox-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder={t("admin.governanceOutboxTypePh", "e.g. APPOINTMENT_CONFIRMED")}
            />
          </div>
          <Button type="button" onClick={() => setPage(1)}>
            {t("patients.applyFilters", "Apply")}
          </Button>
        </div>

        <ResponsiveTable>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOutboxColWhen", "Created")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOutboxColType", "Type")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOutboxColTarget", "Target")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOutboxColStatus", "Status")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOutboxColAttempts", "Attempts")}</th>
                <th className="px-3 py-2 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.target}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.status === "SENT" ? "secondary" : r.status === "DEAD" ? "default" : "outline"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 ltr-nums">{r.attempts}</td>
                  <td className="px-3 py-2 text-end">
                    {r.status !== "SENT" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(r.id)}
                      >
                        {t("admin.governanceOutboxRetry", "Retry")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!events.isPending && !rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    {t("admin.governanceOutboxEmpty", "No outbox events match your filters.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>

        {total > 0 ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            disabled={events.isPending}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}