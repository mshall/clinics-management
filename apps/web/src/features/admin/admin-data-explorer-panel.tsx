import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExportProgressDialog, type ExportProgressState } from "@/components/export-progress-dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { absoluteDownloadUrl } from "@/lib/api-url";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { DoubleLinkedPatientsPanel } from "@/features/admin/double-linked-patients-panel";

type OrgBackupJob = {
  id: string;
  scope?: string;
  status: string;
  progress: number;
  fileName?: string | null;
  downloadPath?: string | null;
  downloadUrl?: string | null;
  downloadToken?: string | null;
  error?: string | null;
  rowCounts?: unknown;
  completedAt?: string | null;
};

/** Native browser download via absolute API URL (avoids Vite proxy mid-stream failures on large ZIPs). */
function triggerNativeDownload(downloadUrl: string) {
  const a = document.createElement("a");
  a.href = absoluteDownloadUrl(downloadUrl);
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type ExplorerOps = { list: boolean; get: boolean; create: boolean; patch: boolean; delete: boolean };

export type DataExplorerTableMeta = {
  key: string;
  label: string;
  scope: string;
  exportable?: boolean;
  /** Special admin tools that are not generic table CRUD. */
  tool?: string;
  ops: ExplorerOps;
};

type CatalogResponse = { tables: DataExplorerTableMeta[] };

type PaginatedRows = {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AdminDataExplorerPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [table, setTable] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createJson, setCreateJson] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingDocuments, setExportingDocuments] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportKeys, setExportKeys] = useState<Set<string>>(() => new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgressState>({
    open: false,
    title: "",
    percent: 0,
    status: "running",
  });
  const importInputRef = useRef<HTMLInputElement>(null);
  /** Only set when the user cancels the in-flight job entirely (not when closing the dialog). */
  const pollAbortRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);
  const backgroundPollIds = useRef(new Set<string>());
  const [cancellingExport, setCancellingExport] = useState(false);

  const catalogQ = useQuery({
    queryKey: ["admin", "data-explorer", "catalog"],
    queryFn: () => apiGet<CatalogResponse>("/api/v1/admin/data-explorer/tables"),
  });

  const jobsQ = useQuery({
    queryKey: ["admin", "data-explorer", "export-jobs"],
    queryFn: () => apiGet<{ items: OrgBackupJob[] }>("/api/v1/admin/data-explorer/export/jobs?limit=12"),
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      return items.some((j) => j.status === "RUNNING" || j.status === "PENDING") ? 2000 : false;
    },
  });

  const meta = catalogQ.data?.tables.find((x) => x.key === table);
  const isDoubleLinkedTool = table === "double_linked_patients" || meta?.tool === "double_linked_patients";

  const listQ = useQuery({
    queryKey: ["admin", "data-explorer", "list", table, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedRows>(`/api/v1/admin/data-explorer/${encodeURIComponent(table)}?page=${page}&pageSize=${pageSize}`),
    enabled: Boolean(table) && !isDoubleLinkedTool,
  });

  useEffect(() => {
    setPage(1);
  }, [table]);

  useEffect(() => {
    if (!catalogQ.data?.tables.length || table) return;
    setTable(catalogQ.data.tables[0]?.key ?? "");
  }, [catalogQ.data, table]);

  const exportableTables = useMemo(
    () => (catalogQ.data?.tables ?? []).filter((x) => x.exportable !== false),
    [catalogQ.data?.tables],
  );

  useEffect(() => {
    if (!exportableTables.length) return;
    setExportKeys(new Set(exportableTables.map((x) => x.key)));
  }, [exportableTables]);

  const allExportSelected =
    exportableTables.length > 0 && exportableTables.every((x) => exportKeys.has(x.key));
  const someExportSelected = exportableTables.some((x) => exportKeys.has(x.key));

  const columns = useMemo(() => {
    const first = listQ.data?.items[0];
    if (!first) return [] as string[];
    return Object.keys(first).sort((a, b) => a.localeCompare(b));
  }, [listQ.data?.items]);

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch<unknown>(`/api/v1/admin/data-explorer/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      setFormError(null);
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "list", table] });
    },
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<unknown>(`/api/v1/admin/data-explorer/${encodeURIComponent(table)}`, body),
    onSuccess: async () => {
      setFormError(null);
      setCreateOpen(false);
      setCreateJson("{}");
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "list", table] });
    },
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/data-explorer/${encodeURIComponent(table)}/${encodeURIComponent(id)}`),
    onSuccess: async () => {
      setDeleteTargetId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "list", table] });
    },
  });

  function openEdit(row: Record<string, unknown>) {
    const id = String(row.id ?? "");
    if (!id) {
      setFormError(t("admin.dataExplorerNoId", "This row has no id field; cannot edit via API."));
      return;
    }
    setFormError(null);
    setEditId(id);
    const rest = { ...row };
    delete rest.id;
    setEditJson(JSON.stringify(rest, null, 2));
  }

  function submitEdit() {
    if (!editId) return;
    try {
      const body = JSON.parse(editJson) as Record<string, unknown>;
      patchMut.mutate({ id: editId, body });
    } catch {
      setFormError(t("admin.dataExplorerInvalidJson", "Invalid JSON."));
    }
  }

  function submitCreate() {
    try {
      const body = JSON.parse(createJson) as Record<string, unknown>;
      createMut.mutate(body);
    } catch {
      setFormError(t("admin.dataExplorerInvalidJson", "Invalid JSON."));
    }
  }

  async function pollJobUntilReady(jobId: string, title: string, mode: "export" | "import") {
    pollAbortRef.current = false;
    activeJobIdRef.current = jobId;
    backgroundPollIds.current.add(jobId);
    setProgress((prev) => ({
      open: true,
      title,
      mode,
      percent: Math.max(prev.percent || 2, 2),
      status: "running",
      error: null,
      detail:
        mode === "import"
          ? t("admin.importProgressWorking", "Restoring SQL and files in the background…")
          : t(
              "admin.exportProgressWorking",
              "Preparing your file. You can cancel this operation or wait until the backup is ready.",
            ),
    }));
    try {
      for (;;) {
        if (pollAbortRef.current) return;
        const job = await apiGet<OrgBackupJob>(`/api/v1/admin/data-explorer/export/jobs/${jobId}`);
        const uiStatus =
          job.status === "FAILED"
            ? "failed"
            : job.status === "CANCELLED"
              ? "cancelled"
              : job.status === "READY"
                ? "ready"
                : "running";
        setProgress((prev) => ({
          ...prev,
          // Keep dialog open only if still showing; background toast covers dismiss case.
          open: prev.open || job.status === "FAILED" || job.status === "CANCELLED",
          title,
          mode,
          percent: job.progress ?? prev.percent,
          status: uiStatus,
          error: job.error,
          detail:
            job.status === "READY"
              ? mode === "import"
                ? t("admin.importProgressReady", "Import finished.")
                : t("admin.exportProgressReady", "File is ready. Your download should start shortly.")
              : job.status === "CANCELLED"
                ? t(
                    "admin.exportProgressCancelledDetail",
                    "The operation was cancelled. You can start again when ready.",
                  )
                : mode === "import"
                  ? t("admin.importProgressWorking", "Restoring SQL and files in the background…")
                  : t(
                      "admin.exportProgressWorking",
                      "Preparing your file. You can cancel this operation or wait until the backup is ready.",
                    ),
        }));
        if (job.status === "CANCELLED") {
          toast.message(t("admin.exportCancelledToast", "Backup cancelled."));
          await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "export-jobs"] });
          return;
        }
        if (job.status === "FAILED") {
          const msg = job.error || t("common.error");
          toast.error(msg);
          setProgress((prev) => ({
            ...prev,
            open: true,
            mode,
            title,
            status: "failed",
            error: msg,
            percent: job.progress ?? prev.percent,
            detail: t(
              "admin.importProgressFailedHint",
              "The job stopped before finishing. Review the error below, then try again with a valid backup file.",
            ),
          }));
          throw new Error(msg);
        }
        if (job.status === "READY") {
          await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "export-jobs"] });
          if (mode === "export") {
            if (job.downloadUrl) {
              triggerNativeDownload(job.downloadUrl);
              toast.success(
                t("admin.exportReadyToast", "Backup ready — download started ({{name}}).", {
                  name: job.fileName || "backup",
                }),
              );
            } else {
              toast.success(
                t(
                  "admin.exportReadyToastNoUrl",
                  "Backup ready. Use Download in the recent jobs list below.",
                ),
              );
            }
          } else {
            toast.success(t("admin.importProgressReady", "Import finished."));
          }
          setProgress((prev) => ({
            ...prev,
            mode,
            title,
            percent: 100,
            status: "ready",
            open: true,
            error: null,
          }));
          // Keep success visible briefly so the percentage and status are readable.
          window.setTimeout(() => setProgress((p) => ({ ...p, open: false })), 2200);
          return;
        }
        await new Promise((r) => window.setTimeout(r, 800));
      }
    } finally {
      backgroundPollIds.current.delete(jobId);
      if (activeJobIdRef.current === jobId) activeJobIdRef.current = null;
    }
  }

  async function cancelActiveJob() {
    const jobId = activeJobIdRef.current;
    if (!jobId || cancellingExport) return;
    setCancellingExport(true);
    pollAbortRef.current = true;
    try {
      await apiPost(`/api/v1/admin/data-explorer/export/jobs/${encodeURIComponent(jobId)}/cancel`, {});
      toast.message(t("admin.exportCancelledToast", "Backup cancelled."));
      setProgress((prev) => ({
        ...prev,
        open: true,
        status: "cancelled",
        detail: t(
          "admin.exportProgressCancelledDetail",
          "The operation was cancelled. You can start again when ready.",
        ),
      }));
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "export-jobs"] });
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      toast.error(msg);
      // Resume polling if cancel failed.
      pollAbortRef.current = false;
    } finally {
      setCancellingExport(false);
    }
  }

  async function runOrgExport(format: "SQL" | "DOCUMENTS" | "FULL") {
    if (exportKeys.size === 0) {
      setFormError(t("admin.dataExplorerExportNone", "Select at least one entity to export."));
      return;
    }
    setFormError(null);
    const titles = {
      SQL: t("admin.exportProgressSqlTitle", "Exporting organization SQL"),
      DOCUMENTS: t("admin.exportProgressZipTitle", "Exporting documents ZIP"),
      FULL: t("admin.exportProgressFullTitle", "Exporting full organization backup"),
    } as const;
    if (format === "SQL") setExporting(true);
    if (format === "DOCUMENTS") setExportingDocuments(true);
    if (format === "FULL") setExportingFull(true);
    try {
      const job = await apiPost<OrgBackupJob>("/api/v1/admin/data-explorer/export/jobs", {
        format,
        tables: [...exportKeys],
      });
      toast.message(
        t("admin.exportStartedToast", "Backup job started — you can keep working while it runs."),
      );
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "export-jobs"] });
      // Buttons unlock immediately; polling continues in the background.
      setExporting(false);
      setExportingDocuments(false);
      setExportingFull(false);
      await pollJobUntilReady(job.id, titles[format], "export");
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setFormError(msg);
      setProgress((prev) => ({
        ...prev,
        open: true,
        mode: "export",
        status: "failed",
        error: msg,
        // Do not force 100% on failure.
        percent: prev.status === "failed" ? prev.percent : Math.min(prev.percent, 99),
      }));
      setExporting(false);
      setExportingDocuments(false);
      setExportingFull(false);
    }
  }

  async function runOrgImport(file: File) {
    setFormError(null);
    setImporting(true);
    const importTitle = t("admin.importProgressTitle", "Importing organization backup");
    setProgress({
      open: true,
      title: importTitle,
      mode: "import",
      percent: 3,
      status: "running",
      error: null,
      detail: t(
        "admin.importProgressUploading",
        "Uploading {{name}} ({{size}})…",
        {
          name: file.name,
          size: file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.max(1, Math.round(file.size / 1024))} KB`,
        },
      ),
    });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const job = await apiPostFormData<OrgBackupJob>("/api/v1/admin/data-explorer/import", fd, { enhance: false });
      toast.message(t("admin.importStartedToast", "Import job started — restoring in the background."));
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "export-jobs"] });
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
      setProgress((prev) => ({
        ...prev,
        open: true,
        mode: "import",
        title: importTitle,
        percent: Math.max(job.progress ?? 5, 5),
        status: "running",
        detail: t("admin.importProgressWorking", "Restoring SQL and files in the background…"),
      }));
      await pollJobUntilReady(job.id, importTitle, "import");
      await qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "list"] });
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setFormError(msg);
      setProgress((prev) => ({
        ...prev,
        open: true,
        mode: "import",
        title: importTitle,
        status: "failed",
        error: msg,
        percent: Math.min(Math.max(prev.percent, 1), 99),
        detail: t(
          "admin.importProgressFailedHint",
          "The job stopped before finishing. Review the error below, then try again with a valid backup file.",
        ),
      }));
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function toggleExportKey(key: string, on: boolean) {
    setExportKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleExportAll(on: boolean) {
    if (on) setExportKeys(new Set(exportableTables.map((x) => x.key)));
    else setExportKeys(new Set());
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.dataExplorerExportTitle", "Organization export")}</CardTitle>
          <CardDescription>
            {t(
              "admin.dataExplorerExportHint",
              "Choose which entities to include. Export SQL, a documents ZIP (images/files mapped to patients, encounters, operations, …), or a full backup ZIP (SQL + files) for round-trip import. A progress dialog shows percentage until the file is ready.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allExportSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someExportSelected && !allExportSelected;
                }}
                onChange={(e) => toggleExportAll(e.target.checked)}
              />
              {t("admin.dataExplorerExportSelectAll", "Select all entities")}
            </label>
            <span className="text-xs text-muted-foreground">
              {t("admin.dataExplorerExportSelectedCount", "{{count}} selected", { count: exportKeys.size })}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {exportableTables.map((x) => (
              <label key={x.key} className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={exportKeys.has(x.key)}
                  onChange={(e) => toggleExportKey(x.key, e.target.checked)}
                />
                <span>
                  <span className="font-medium">{x.label}</span>
                  <span className="block text-xs text-muted-foreground ltr-nums">{x.key}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={exporting || exportingDocuments || exportingFull || exportKeys.size === 0}
              onClick={() => void runOrgExport("SQL")}
            >
              {exporting
                ? t("common.loading")
                : t("admin.dataExplorerExportSql", "Export selected as SQL ({{count}})", { count: exportKeys.size })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={exporting || exportingDocuments || exportingFull || exportKeys.size === 0}
              onClick={() => void runOrgExport("DOCUMENTS")}
            >
              {exportingDocuments
                ? t("common.loading")
                : t("admin.dataExplorerExportDocuments", "Download documents ZIP ({{count}})", { count: exportKeys.size })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={exporting || exportingDocuments || exportingFull || exportKeys.size === 0}
              onClick={() => void runOrgExport("FULL")}
            >
              {exportingFull
                ? t("common.loading")
                : t("admin.dataExplorerExportFull", "Full backup ZIP (SQL + files)")}
            </Button>
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">{t("admin.dataExplorerImportTitle", "Import backup")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".sql,.zip,application/sql,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runOrgImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={importing || exporting || exportingDocuments || exportingFull}
                onClick={() => importInputRef.current?.click()}
              >
                {importing
                  ? t("common.loading")
                  : t("admin.dataExplorerImport", "Import SQL or ZIP backup")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "admin.dataExplorerImportHint",
                "Import the same files export produces: organization-export.sql, or a full/documents ZIP with organization-export.sql + files/ + manifest.json. Runs as a background job so large restores do not time out.",
              )}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "admin.dataExplorerExportDocumentsHint",
              "Documents ZIP includes patient, encounter, employee, expense, and operation files from local disk or S3, plus manifest.json. Full backup also embeds the SQL dump for one-step restore. Use Cancel in the progress dialog to stop, or wait until the file is ready.",
            )}
          </p>

          {(jobsQ.data?.items?.length ?? 0) > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium">
                {t("admin.dataExplorerRecentJobs", "Recent backup jobs")}
              </p>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {(jobsQ.data?.items ?? []).map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {job.fileName || job.scope || job.id}
                      </p>
                      <p className="text-xs text-muted-foreground ltr-nums">
                        {job.scope ?? "—"} · {job.status}
                        {job.status === "RUNNING" ? ` · ${job.progress ?? 0}%` : ""}
                        {job.completedAt
                          ? ` · ${new Date(job.completedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    {job.status === "READY" && job.scope !== "ORG_IMPORT" && job.downloadUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => triggerNativeDownload(job.downloadUrl!)}
                      >
                        {t("admin.dataExplorerDownloadJob", "Download")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.dataExplorerTitle", "Data explorer")}</CardTitle>
          <CardDescription>
            {t(
              "admin.dataExplorerDescription",
              "Browse and edit allowlisted database tables for this organization. Changes apply immediately; destructive actions cannot be undone. Passwords are never exposed or set from here."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalogQ.isError ? (
            <p className="text-sm text-destructive">{catalogQ.error instanceof Error ? catalogQ.error.message : t("common.error")}</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1 space-y-2">
              <Label htmlFor="de-table">{t("admin.dataExplorerTable", "Table")}</Label>
              <select
                id="de-table"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={table}
                onChange={(e) => setTable(e.target.value)}
                disabled={catalogQ.isPending}
              >
                {(catalogQ.data?.tables ?? []).map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label} ({x.key})
                  </option>
                ))}
              </select>
            </div>
            {meta?.ops.create ? (
              <Button type="button" variant="secondary" onClick={() => { setFormError(null); setCreateOpen(true); }}>
                {t("admin.dataExplorerAddRow", "Add row (JSON)")}
              </Button>
            ) : null}
          </div>

          {meta && !isDoubleLinkedTool ? (
            <p className="text-xs text-muted-foreground">
              {t("admin.dataExplorerOps", "Operations:")} {meta.ops.list ? "list " : ""}
              {meta.ops.get ? "view " : ""}
              {meta.ops.create ? "create " : ""}
              {meta.ops.patch ? "edit " : ""}
              {meta.ops.delete ? "delete" : ""} · {t("admin.dataExplorerScope", "Scope")}: {meta.scope}
            </p>
          ) : null}

          {isDoubleLinkedTool ? <DoubleLinkedPatientsPanel /> : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          {!isDoubleLinkedTool && listQ.isError ? (
            <p className="text-sm text-destructive">{listQ.error instanceof Error ? listQ.error.message : t("common.error")}</p>
          ) : null}

          {!isDoubleLinkedTool && listQ.isPending && table ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : null}

          {!isDoubleLinkedTool && table && !listQ.isPending && listQ.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.dataExplorerEmpty", "No rows in this table.")}</p>
          ) : null}

          {!isDoubleLinkedTool && columns.length > 0 ? (
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="px-2 py-2 text-start font-medium whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-end font-medium">{t("common.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(listQ.data?.items ?? []).map((row) => {
                    const id = String(row.id ?? "");
                    return (
                      <tr key={id || JSON.stringify(row).slice(0, 40)} className="border-t border-border">
                        {columns.map((c) => (
                          <td key={c} className="max-w-[14rem] truncate px-2 py-1.5 font-mono" title={formatCell(row[c])}>
                            {formatCell(row[c])}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-end whitespace-nowrap">
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewRow(row)}>
                            {t("admin.dataExplorerView", "View")}
                          </Button>
                          {meta?.ops.patch && id ? (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(row)}>
                              {t("admin.dataExplorerEdit", "Edit")}
                            </Button>
                          ) : null}
                          {meta?.ops.delete && id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              disabled={deleteMut.isPending}
                              onClick={() => setDeleteTargetId(id)}
                            >
                              {t("common.delete", "Delete")}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          ) : null}

          {listQ.data && listQ.data.total > 0 ? (
            <TablePagination
              page={listQ.data.page}
              pageSize={listQ.data.pageSize}
              total={listQ.data.total}
              totalPages={listQ.data.totalPages}
              disabled={listQ.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(viewRow)} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.dataExplorerViewTitle", "Row JSON")}</DialogTitle>
          </DialogHeader>
          {viewRow ? (
            <pre className="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">{JSON.stringify(viewRow, null, 2)}</pre>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editId)} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.dataExplorerEditTitle", "Patch row (JSON body)")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t("admin.dataExplorerEditHint", "Send only fields to change. id is omitted.")}
          </p>
          <Textarea className="min-h-[240px] font-mono text-xs" value={editJson} onChange={(e) => setEditJson(e.target.value)} spellCheck={false} />
          {formError && editId ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditId(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={patchMut.isPending} onClick={() => submitEdit()}>
              {patchMut.isPending ? t("common.loading") : t("admin.dataExplorerSavePatch", "Save changes")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.dataExplorerCreateTitle", "Create row (JSON)")}</DialogTitle>
          </DialogHeader>
          <Textarea className="min-h-[240px] font-mono text-xs" value={createJson} onChange={(e) => setCreateJson(e.target.value)} spellCheck={false} />
          {formError && createOpen ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={createMut.isPending} onClick={() => submitCreate()}>
              {createMut.isPending ? t("common.loading") : t("admin.dataExplorerCreate", "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTargetId != null}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setDeleteTargetId(null);
        }}
        title={t("admin.dataExplorerDeleteTitle", "Delete row?")}
        description={t("admin.dataExplorerDeleteConfirm", "Delete this row?")}
        confirmLabel={t("common.delete", "Delete")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={deleteMut.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteMut.mutate(deleteTargetId);
        }}
      />

      <ExportProgressDialog
        state={progress}
        onOpenChange={(open) => {
          // Closing the dialog does NOT cancel the background job — use Cancel for that.
          setProgress((p) => ({ ...p, open }));
        }}
        onCancel={progress.status === "running" ? () => void cancelActiveJob() : undefined}
        cancelling={cancellingExport}
      />
    </div>
  );
}
