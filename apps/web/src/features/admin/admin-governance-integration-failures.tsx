import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/search-input";
import {
  useAdminIntegrationFailureGroupsQuery,
  useAdminIntegrationFailuresQuery,
  useAdminIntegrationFailuresSummaryQuery,
  useAdminOverviewQuery,
  useClinicsQuery,
} from "@/lib/api-hooks";
import type { AdminIntegrationFailureItemDto } from "@/lib/api-types";
import { apiDownload, apiGet, apiPatch, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { useAuthStore } from "@/stores/auth-store";

const CATEGORIES = ["", "AUTH", "APPOINTMENT", "OPERATION", "WEBHOOK"] as const;
const WORKFLOW_STATUSES = ["", "OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;

type IntegrationClientRow = { id: string; name: string; clientKey: string };

function severityVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "critical") return "default";
  if (s === "warning") return "outline";
  return "secondary";
}

async function copyText(value: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(okMessage);
  } catch {
    toast.error("Copy failed");
  }
}

function FailureDetailFields({
  detail,
  traceStr,
  requestStr,
  onStatusChange,
  onRetryWebhook,
  statusPending,
  retryPending,
}: {
  detail: AdminIntegrationFailureItemDto;
  traceStr: string;
  requestStr: string;
  onStatusChange: (status: AdminIntegrationFailureItemDto["workflowStatus"], note?: string) => void;
  onRetryWebhook: () => void;
  statusPending: boolean;
  retryPending: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(detail.resolutionNote ?? "");

  const fields: { label: string; value: string; mono?: boolean; copy?: boolean }[] = [
    { label: t("admin.governanceFailureId", "Failure ID"), value: detail.id, mono: true, copy: true },
    { label: t("admin.governanceCorrelation", "Correlation ID"), value: detail.correlationId ?? "—", mono: true, copy: Boolean(detail.correlationId) },
    { label: t("admin.governanceWorkflowStatus", "Workflow status"), value: detail.workflowStatus },
    { label: t("admin.governanceOperationType", "Operation type"), value: detail.operationTypeLabel },
    { label: t("admin.governanceOperationName", "Operation name"), value: detail.operationName },
    { label: t("admin.governanceOperationCode", "Operation code"), value: detail.operationCode, mono: true },
    ...(detail.patientMrn
      ? [{ label: t("admin.governancePatientMrn", "Patient MRN"), value: detail.patientMrn, mono: true, copy: true }]
      : []),
    { label: t("admin.governanceFailuresReason", "Reason"), value: detail.reason },
    { label: t("admin.governanceFailuresReasonDetail", "Detailed reason"), value: detail.reasonDetail },
    { label: t("admin.governanceFailuresError", "Raw error"), value: detail.errorMessage },
  ];

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant={severityVariant(detail.resolution.severity)}>{detail.resolution.severity}</Badge>
        <Badge variant="outline">{detail.workflowStatus}</Badge>
        <span className="font-mono text-xs">{detail.category}</span>
        <span className="ltr-nums text-muted-foreground">HTTP {detail.statusCode}</span>
      </div>

      {detail.externalReference ? (
        <p>
          <span className="text-muted-foreground">{t("admin.governanceExternalRef", "External reference")}: </span>
          <span className="font-mono text-xs">{detail.externalReference}</span>
        </p>
      ) : null}

      <dl className="grid gap-2 rounded-md border border-border p-3">
        {fields.map((f) => (
          <div key={f.label} className="grid gap-0.5 sm:grid-cols-[minmax(8rem,10rem)_1fr]">
            <dt className="text-muted-foreground text-xs font-medium">{f.label}</dt>
            <dd className={`${f.mono ? "font-mono text-xs break-all" : ""} flex flex-wrap items-start gap-2`}>
              <span className="min-w-0">{f.value}</span>
              {f.copy && f.value && f.value !== "—" ? (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => void copyText(f.value, t("admin.governanceCopied", "Copied"))}>
                  {t("common.copy", "Copy")}
                </Button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={statusPending} onClick={() => onStatusChange("ACKNOWLEDGED", note)}>
          {t("admin.governanceAcknowledge", "Acknowledge")}
        </Button>
        <Button type="button" size="sm" disabled={statusPending} onClick={() => onStatusChange("RESOLVED", note)}>
          {t("admin.governanceResolve", "Mark resolved")}
        </Button>
        {detail.canRetryWebhook ? (
          <Button type="button" size="sm" variant="secondary" disabled={retryPending} onClick={onRetryWebhook}>
            {t("admin.governanceRetryWebhook", "Retry webhook")}
          </Button>
        ) : null}
      </div>

      <ResolutionNoteField note={note} setNote={setNote} />

      {detail.resolution.likelyCause ? (
        <p>
          <span className="text-muted-foreground">{t("admin.governanceLikelyCause", "Likely cause")}: </span>
          {detail.resolution.likelyCause}
        </p>
      ) : null}
      <p className="font-medium">{detail.resolution.summary}</p>
      <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
        {detail.resolution.actions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>

      {traceStr ? (
        <div>
          <p className="font-medium mb-1">{t("admin.governanceTrace", "Trace")}</p>
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">{traceStr}</pre>
        </div>
      ) : null}
      {requestStr ? (
        <div>
          <p className="font-medium mb-1">{t("admin.governanceRequestContext", "Request context")}</p>
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">{requestStr}</pre>
        </div>
      ) : null}
    </div>
  );
}

function ResolutionNoteField({ note, setNote }: { note: string; setNote: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Label htmlFor="failure-note">{t("admin.governanceResolutionNote", "Resolution note")}</Label>
      <Input id="failure-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
    </div>
  );
}

export function AdminGovernanceIntegrationFailures() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isGroupAdmin = authUser?.role === "group_admin";

  const [view, setView] = useState<"events" | "groups">("events");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [category, setCategory] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [integrationClientId, setIntegrationClientId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AdminIntegrationFailureItemDto | null>(null);
  const [retentionDraft, setRetentionDraft] = useState("30");

  const locale = i18n.language;
  const overview = useAdminOverviewQuery();
  const summary = useAdminIntegrationFailuresSummaryQuery();
  const { data: clinics = [] } = useClinicsQuery();
  const clientsQuery = useQuery({
    queryKey: ["admin", "integration-clients"],
    queryFn: () => apiGet<IntegrationClientRow[]>("/api/v1/admin/integration-clients"),
  });

  useEffect(() => {
    const d = overview.data?.currentTenant?.integrationFailureRetentionDays;
    if (d != null) setRetentionDraft(String(d));
  }, [overview.data?.currentTenant?.integrationFailureRetentionDays]);

  const failures = useAdminIntegrationFailuresQuery({
    page,
    pageSize,
    q: qApplied,
    from,
    to,
    category: category || undefined,
    integrationClientId: integrationClientId || undefined,
    clinicId: clinicId || undefined,
    status: workflowStatus || undefined,
    locale,
    enabled: view === "events",
  });

  const groups = useAdminIntegrationFailureGroupsQuery({
    page,
    pageSize,
    from,
    to,
    category: category || undefined,
    locale,
    enabled: view === "groups",
  });

  const loadDetail = useMutation({
    mutationFn: (id: string) =>
      apiGet<AdminIntegrationFailureItemDto>(`/api/v1/admin/integration-failures/${id}?locale=${encodeURIComponent(locale)}`),
    onSuccess: (row) => setDetail(row),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const patchStatus = useMutation({
    mutationFn: (args: { id: string; status: AdminIntegrationFailureItemDto["workflowStatus"]; note?: string }) =>
      apiPatch<AdminIntegrationFailureItemDto>(`/api/v1/admin/integration-failures/${args.id}`, {
        status: args.status,
        resolutionNote: args.note,
      }),
    onSuccess: async (row) => {
      setDetail(row);
      await qc.invalidateQueries({ queryKey: ["admin", "integration-failures"] });
      toast.success(t("admin.governanceStatusUpdated", "Status updated"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const retryWebhook = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: boolean; message: string }>(`/api/v1/admin/integration-failures/${id}/retry-webhook`, {}),
    onSuccess: (res) => toast.success(res.message),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const saveRetention = useMutation({
    mutationFn: () =>
      apiPatch("/api/v1/admin/tenant-settings", {
        integrationFailureRetentionDays: Number.parseInt(retentionDraft, 10) || 30,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      await qc.invalidateQueries({ queryKey: ["admin", "integration-failures"] });
      toast.success(t("admin.governanceRetentionSaved", "Retention policy saved"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const openDetail = (row: AdminIntegrationFailureItemDto) => {
    setDetail(row);
    void loadDetail.mutate(row.id);
  };

  const rows = failures.data?.items ?? [];
  const groupRows = groups.data?.items ?? [];
  const active = view === "events" ? failures : groups;
  const total = active.data?.total ?? 0;
  const totalPages = active.data?.totalPages ?? 1;
  const activeDetail = loadDetail.data ?? detail;

  const traceStr = useMemo(() => {
    if (!activeDetail?.trace) return "";
    try {
      return JSON.stringify(activeDetail.trace, null, 2);
    } catch {
      return String(activeDetail.trace);
    }
  }, [activeDetail?.trace]);

  const requestStr = useMemo(() => {
    if (!activeDetail?.requestContext) return "";
    try {
      return JSON.stringify(activeDetail.requestContext, null, 2);
    } catch {
      return String(activeDetail.requestContext);
    }
  }, [activeDetail?.requestContext]);

  const applyFilters = () => {
    setPage(1);
    setQApplied(qDraft.trim());
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (qApplied) params.set("q", qApplied);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (integrationClientId) params.set("integrationClientId", integrationClientId);
    if (clinicId) params.set("clinicId", clinicId);
    if (workflowStatus) params.set("status", workflowStatus);
    try {
      await apiDownload(`/api/v1/admin/integration-failures/export?${params.toString()}`, "integration-failures.csv");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      {summary.data?.spikeDetected ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm">
            {t(
              "admin.governanceSpikeAlert",
              "Elevated integration failure rate in the last hour. Review failing operations and check the audit log for INTEGRATION_FAILURE_SPIKE.",
            )}
          </CardContent>
        </Card>
      ) : null}

      {summary.data ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="py-3 text-sm">
              <p className="text-muted-foreground">{t("admin.governanceSummary24h", "Failures (24h)")}</p>
              <p className="text-2xl font-semibold ltr-nums">{summary.data.totalLast24h}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-sm">
              <p className="text-muted-foreground">{t("admin.governanceSummaryOpen", "Open")}</p>
              <p className="text-2xl font-semibold ltr-nums">{summary.data.openCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-sm">
              <p className="text-muted-foreground">{t("admin.governanceSummaryHour", "Last hour")}</p>
              <p className="text-2xl font-semibold ltr-nums">{summary.data.failuresLastHour}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-sm">
              <p className="text-muted-foreground">{t("admin.governanceRetentionDays", "Retention (days)")}</p>
              <p className="text-2xl font-semibold ltr-nums">{summary.data.retentionDays}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isGroupAdmin ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("admin.governanceRetentionPolicy", "Failure log retention")}</CardTitle>
            <CardDescription>
              {t(
                "admin.governanceRetentionHint",
                "Logs older than this number of days are deleted automatically (default 30). Purge runs every 6 hours on the server.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="retention-days">{t("admin.governanceRetentionDays", "Retention (days)")}</Label>
              <Input
                id="retention-days"
                className="w-28"
                type="number"
                min={1}
                max={3650}
                value={retentionDraft}
                onChange={(e) => setRetentionDraft(e.target.value)}
              />
            </div>
            <Button type="button" disabled={saveRetention.isPending} onClick={() => saveRetention.mutate()}>
              {t("common.save", "Save")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t("admin.governanceFailuresTitle", "Failing integration operations")}</CardTitle>
              <CardDescription>{t("admin.governanceFailuresHint")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={view === "events" ? "default" : "outline"} onClick={() => setView("events")}>
                {t("admin.governanceViewEvents", "All events")}
              </Button>
              <Button type="button" size="sm" variant={view === "groups" ? "default" : "outline"} onClick={() => setView("groups")}>
                {t("admin.governanceViewGroups", "Grouped")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void exportCsv()}>
                {t("admin.governanceExportCsv", "Export CSV")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {view === "events" ? (
              <div className="min-w-[12rem] flex-1 space-y-2">
                <label className="text-sm font-medium" htmlFor="failure-q">
                  {t("admin.governanceFailuresSearch", "Search")}
                </label>
                <SearchInput
                  id="failure-q"
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  placeholder={t("admin.governanceFailuresSearchPh", "ID, reason, MRN, operation name, client…")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyFilters();
                  }}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="failure-from">
                {t("admin.governanceFrom", "From")}
              </label>
              <Input id="failure-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="failure-to">
                {t("admin.governanceTo", "To")}
              </label>
              <Input id="failure-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="failure-cat">
                {t("admin.governanceFailuresCategory", "Category")}
              </label>
              <select
                id="failure-cat"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c || "all"} value={c}>
                    {c || t("admin.governanceFailuresAllCategories", "All")}
                  </option>
                ))}
              </select>
            </div>
            {view === "events" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="failure-status">
                    {t("admin.governanceWorkflowStatus", "Workflow status")}
                  </label>
                  <select
                    id="failure-status"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={workflowStatus}
                    onChange={(e) => {
                      setWorkflowStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    {WORKFLOW_STATUSES.map((s) => (
                      <option key={s || "all"} value={s}>
                        {s || t("admin.governanceFailuresAllCategories", "All")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="failure-client">
                    {t("admin.governanceClientFilter", "Client")}
                  </label>
                  <select
                    id="failure-client"
                    className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
                    value={integrationClientId}
                    onChange={(e) => {
                      setIntegrationClientId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t("admin.governanceFailuresAllCategories", "All")}</option>
                    {(clientsQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="failure-clinic">
                    {t("admin.governanceClinicFilter", "Clinic")}
                  </label>
                  <select
                    id="failure-clinic"
                    className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
                    value={clinicId}
                    onChange={(e) => {
                      setClinicId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t("admin.governanceFailuresAllCategories", "All")}</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" onClick={applyFilters}>
                  {t("patients.applyFilters", "Apply")}
                </Button>
              </>
            ) : null}
          </div>

          {active.isError ? (
            <p className="text-sm text-destructive">
              {active.error instanceof Error ? active.error.message : t("common.error")}
            </p>
          ) : null}

          {view === "events" ? (
            <ResponsiveTable>
              <table className="w-full min-w-[1140px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.auditColWhen", "Time")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailureId", "Failure ID")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceWorkflowStatus", "Status")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOperationType", "Type")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOperationName", "Operation name")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governancePatientMrn", "Patient MRN")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresReason", "Reason")}</th>
                    <th className="px-3 py-2 text-start font-medium">HTTP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/50"
                      onClick={() => openDetail(r)}
                    >
                      <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.id.slice(0, 10)}…</td>
                      <td className="px-3 py-2 text-xs">{r.workflowStatus}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.operationTypeLabel || r.category}</td>
                    <td className="px-3 py-2 font-medium">{r.operationName || r.operation}</td>
                    <td className="px-3 py-2 font-mono text-xs ltr-nums">{r.patientMrn ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate" title={r.reasonDetail}>
                      {r.reason}
                    </td>
                      <td className="px-3 py-2 ltr-nums">{r.statusCode}</td>
                    </tr>
                  ))}
                  {!failures.isPending && !rows.length ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        {t("admin.governanceFailuresEmpty")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTable>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceGroupCount", "Count")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceSummaryOpen", "Open")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOperationName", "Operation name")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresReason", "Reason")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.governanceLastSeen", "Last seen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((g) => (
                    <tr key={g.fingerprint} className="cursor-pointer border-t border-border hover:bg-muted/50" onClick={() => openDetail(g.latest)}>
                      <td className="px-3 py-2 ltr-nums font-medium">{g.count}</td>
                      <td className="px-3 py-2 ltr-nums">{g.openCount}</td>
                      <td className="px-3 py-2">{g.latest.operationName}</td>
                      <td className="px-3 py-2 truncate max-w-[280px]">{g.latest.reason}</td>
                      <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                        {g.lastSeenAt ? new Date(g.lastSeenAt).toLocaleString(localeForLanguage(i18n.language)) : "—"}
                      </td>
                    </tr>
                  ))}
                  {!groups.isPending && !groupRows.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        {t("admin.governanceFailuresEmpty")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTable>
          )}

          {total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              disabled={active.isPending}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(activeDetail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.governanceFailureDetail", "Integration failure trace")}</DialogTitle>
          </DialogHeader>
          {activeDetail ? (
            <FailureDetailFields
              detail={activeDetail}
              traceStr={traceStr}
              requestStr={requestStr}
              statusPending={patchStatus.isPending}
              retryPending={retryWebhook.isPending}
              onStatusChange={(status, note) => patchStatus.mutate({ id: activeDetail.id, status, note })}
              onRetryWebhook={() => retryWebhook.mutate(activeDetail.id)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
