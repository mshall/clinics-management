import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchInput } from "@/components/search-input";
import { useAdminIntegrationFailuresQuery } from "@/lib/api-hooks";
import type { AdminIntegrationFailureItemDto } from "@/lib/api-types";
import { localeForLanguage } from "@/lib/locale-display";

const CATEGORIES = ["", "AUTH", "APPOINTMENT", "OPERATION", "WEBHOOK"] as const;

function severityVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "critical") return "default";
  if (s === "warning") return "outline";
  return "secondary";
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

  const rows = failures.data?.items ?? [];
  const total = failures.data?.total ?? 0;
  const totalPages = failures.data?.totalPages ?? 1;

  const traceStr = useMemo(() => {
    if (!detail?.trace) return "";
    try {
      return JSON.stringify(detail.trace, null, 2);
    } catch {
      return String(detail.trace);
    }
  }, [detail?.trace]);

  const requestStr = useMemo(() => {
    if (!detail?.requestContext) return "";
    try {
      return JSON.stringify(detail.requestContext, null, 2);
    } catch {
      return String(detail.requestContext);
    }
  }, [detail?.requestContext]);

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
              "External API and webhook failures with tracing, correlation ids, and suggested fixes.",
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
                placeholder={t("admin.governanceFailuresSearchPh", "Error, operation, path, client…")}
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
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColWhen", "Time")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresCategory", "Category")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresOperation", "Operation")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colName", "Client")}</th>
                  <th className="px-3 py-2 text-start font-medium">HTTP</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.governanceFailuresError", "Error")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/50"
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(r);
                      }
                    }}
                  >
                    <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.category}</td>
                    <td className="px-3 py-2 font-medium">{r.operation}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.integrationClientName ?? "—"}</td>
                    <td className="px-3 py-2 ltr-nums">
                      <span className={r.statusCode >= 500 ? "text-destructive font-medium" : ""}>{r.statusCode}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[240px] truncate text-muted-foreground" title={r.errorMessage}>
                      {r.errorMessage}
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

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.governanceFailureDetail", "Integration failure trace")}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={severityVariant(detail.resolution.severity)}>{detail.resolution.severity}</Badge>
                <span className="font-mono text-xs">{detail.category}</span>
                <span className="font-medium">{detail.operation}</span>
                <span className="ltr-nums text-muted-foreground">HTTP {detail.statusCode}</span>
              </div>
              <p className="text-destructive">{detail.errorMessage}</p>
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
              <div className="grid gap-1 text-xs text-muted-foreground">
                {detail.integrationClientName ? <p>Client: {detail.integrationClientName}</p> : null}
                {detail.correlationId ? (
                  <p className="font-mono">
                    {t("admin.governanceCorrelation", "Correlation")}: {detail.correlationId}
                  </p>
                ) : null}
                {detail.httpMethod && detail.httpPath ? (
                  <p className="font-mono">
                    {detail.httpMethod} {detail.httpPath}
                  </p>
                ) : null}
                {detail.clinicId ? <p className="font-mono">clinicId: {detail.clinicId}</p> : null}
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
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
