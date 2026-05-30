import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

type ExplorerOps = { list: boolean; get: boolean; create: boolean; patch: boolean; delete: boolean };

export type DataExplorerTableMeta = {
  key: string;
  label: string;
  scope: string;
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

  const catalogQ = useQuery({
    queryKey: ["admin", "data-explorer", "catalog"],
    queryFn: () => apiGet<CatalogResponse>("/api/v1/admin/data-explorer/tables"),
  });

  const meta = catalogQ.data?.tables.find((x) => x.key === table);

  const listQ = useQuery({
    queryKey: ["admin", "data-explorer", "list", table, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedRows>(`/api/v1/admin/data-explorer/${encodeURIComponent(table)}?page=${page}&pageSize=${pageSize}`),
    enabled: Boolean(table),
  });

  useEffect(() => {
    setPage(1);
  }, [table]);

  useEffect(() => {
    if (!catalogQ.data?.tables.length || table) return;
    setTable(catalogQ.data.tables[0]?.key ?? "");
  }, [catalogQ.data, table]);

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

  return (
    <div className="space-y-4">
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

          {meta ? (
            <p className="text-xs text-muted-foreground">
              {t("admin.dataExplorerOps", "Operations:")} {meta.ops.list ? "list " : ""}
              {meta.ops.get ? "view " : ""}
              {meta.ops.create ? "create " : ""}
              {meta.ops.patch ? "edit " : ""}
              {meta.ops.delete ? "delete" : ""} · {t("admin.dataExplorerScope", "Scope")}: {meta.scope}
            </p>
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          {listQ.isError ? (
            <p className="text-sm text-destructive">{listQ.error instanceof Error ? listQ.error.message : t("common.error")}</p>
          ) : null}

          {listQ.isPending && table ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}

          {table && !listQ.isPending && listQ.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.dataExplorerEmpty", "No rows in this table.")}</p>
          ) : null}

          {columns.length > 0 ? (
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
                              onClick={() => {
                                if (window.confirm(t("admin.dataExplorerDeleteConfirm", "Delete this row?"))) deleteMut.mutate(id);
                              }}
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
    </div>
  );
}
