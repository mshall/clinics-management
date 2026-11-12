import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchInput } from "@/components/search-input";
import { useAdminIntegrationFailuresQuery } from "@/lib/api-hooks";
import type { AdminIntegrationFailureItemDto } from "@/lib/api-types";
import { apiGet } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";

const CATEGORIES = ["", "AUTH", "APPOINTMENT", "OPERATION", "WEBHOOK"] as const;

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
}: {
  detail: AdminIntegrationFailureItemDto;
  traceStr: string;
  requestStr: string;
}) {
  const { t } = useTranslation();

  const fields: { label: string; value: string; mono?: boolean; copy?: boolean }[] = [
    { label: t("admin.governanceFailureId", "Failure ID"), value: detail.id, mono: true, copy: true },
    { label: t("admin.governanceCorrelation", "Correlation ID"), value: detail.correlationId ?? "—", mono: true, copy: Boolean(detail.correlationId) },
    { label: t("admin.governanceOperationType", "Operation type"), value: detail.operationTypeLabel },
    { label: t("admin.governanceOperationName", "Operation name"), value: detail.operationName },
    { label: t("admin.governanceOperationCode", "Operation code"), value: detail.operationCode, mono: true },
    { label: t("admin.governanceFailuresReason", "Reason"), value: detail.reason },
    { label: t("admin.governanceFailuresReasonDetail", "Detailed reason"), value: detail.reasonDetail },
    { label: t("admin.governanceFailuresError", "Raw error"), value: detail.errorMessage },
    ...(detail.errorCode ? [{ label: t("admin.governanceErrorCode", "Error code"), value: detail.errorCode, mono: true }] : []),
  ];

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant={severityVariant(detail.resolution.severity)}>{detail.resolution.severity}</Badge>
        <span className="font-mono text-xs">{detail.category}</span>
        <span className="ltr-nums text-muted-foreground">HTTP {detail.statusCode}</span>
      </div>

      <dl className="grid gap-2 rounded-md border border-border p-3">
        {fields.map((f) => (
          <div key={f.label} className="grid gap-0.5 sm:grid-cols-[minmax(8rem,10rem)_1fr]">
            <dt className="text-muted-foreground text-xs font-medium">{f.label}</dt>
            <dd className={`${f.mono ? "font-mono text-xs break-all" : ""} flex flex-wrap items-start gap-2`}>
              <span className="min-w-0">{f.value}</span>
              {f.copy && f.value && f.value !== "—" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={() => void copyText(f.value, t("admin.governanceCopied", "Copied"))}
                >
                  {t("common.copy", "Copy")}
                </Button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

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

      <div className="grid gap-1 text-xs text-muted-foreground border-t pt-2">
        {detail.integrationClientName ? (
          <p>
            {t("admin.integrations.colName", "Client")}: {detail.integrationClientName}
            {detail.integrationClientKey ? ` (${detail.integrationClientKey})` : ""}
          </p>
        ) : null}
        {detail.httpMethod && detail.httpPath ? (
          <p className="font-mono">
            {detail.httpMethod} {detail.httpPath}
          </p>
        ) : null}
        {detail.clinicId ? (
          <p className="font-mono">
            clinicId: {detail.clinicId}
            {detail.clinicNameEn ? ` · ${detail.clinicNameEn}` : ""}
          </p>
        ) : null}
      </div>

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

export function AdminGovernanceIntegrationFailures() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<AdminIntegrationFailureItemDto | null>(null);

  const failures = useAdminIntegrationFailuresQuery({
    page,
    pageSize,
    q: qApplied,
    category: category || undefined,
  });

  const loadDetail = useMutation({
    mutationFn: (id: string) => apiGet<AdminIntegrationFailureItemDto>(`/api/v1/admin/integration-failures/${id}`),
    onSuccess: (row) => setDetail(row),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const openDetail = (row: AdminIntegrationFailureItemDto) => {
    setDetail(row);
    void loadDetail.mutate(row.id);
  };

  const rows = failures.data?.items ?? [];
  const total = failures.data?.total ?? 0;
  const totalPages = failures.data?.totalPages ?? 1;

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.governanceFailuresTitle", "Failing integration operations")}</CardTitle>
          <CardDescription>
            {t(
              "admin.governanceFailuresHint",
              "Each row includes failure id, operation type, human-readable name, summary reason, and full detail for debugging.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="failure-q">
                {t("admin.governanceFailuresSearch", "Search")}
              </label>
              <SearchInput
                id="failure-q"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder={t("admin.governanceFailuresSearchPh", "ID, reason, operation name, client…")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
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
            <Button type="button" onClick={applyFilters}>
              {t("patients.applyFilters", "Apply")}
            </Button>
          </div>

          {failures.isError ? (
            <p className="text-sm text-destructive">
              {failures.error instanceof Error ? failures.error.message : t("common.error")}
            </p>
          ) : null}

          <ResponsiveTable>
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColWhen", "Time")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailureId", "Failure ID")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOperationType", "Type")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceOperationName", "Operation name")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresReason", "Reason")}</th>
                  <th className="px-3 py-2 text-start font-medium">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/50"
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(r);
                      }
                    }}
                  >
                    <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" title={r.id}>
                      {r.id.slice(0, 10)}…
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[140px]">
                      {r.operationTypeLabel || r.category}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.operationName || r.operation}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate" title={r.reasonDetail || r.reason}>
                      {r.reason}
                    </td>
                    <td className="px-3 py-2 ltr-nums">
                      <span className={r.statusCode >= 500 ? "text-destructive font-medium" : ""}>{r.statusCode}</span>
                    </td>
                  </tr>
                ))}
                {!failures.isPending && !rows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      {t("admin.governanceFailuresEmpty", "No integration failures in this period.")}
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
              disabled={failures.isPending}
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
          {activeDetail ? <FailureDetailFields detail={activeDetail} traceStr={traceStr} requestStr={requestStr} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
