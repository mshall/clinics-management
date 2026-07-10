import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdminAuditLogsQuery } from "@/lib/api-hooks";
import type { AdminAuditLogItemDto } from "@/lib/api-types";
import { localeForLanguage, formatUserRole } from "@/lib/locale-display";

export function AdminGovernancePanel() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [detail, setDetail] = useState<AdminAuditLogItemDto | null>(null);

  const audit = useAdminAuditLogsQuery({ page, pageSize, q: qApplied });

  const rows = audit.data?.items ?? [];
  const total = audit.data?.total ?? 0;
  const totalPages = audit.data?.totalPages ?? 1;

  const metaStr = useMemo(() => {
    if (!detail?.metadata) return "";
    try {
      return JSON.stringify(detail.metadata, null, 2);
    } catch {
      return String(detail.metadata);
    }
  }, [detail?.metadata]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.tabGovernance")}</CardTitle>
          <CardDescription>
            {t(
              "admin.governanceSubtitleOrg",
              "Searchable audit trail of every user action in your organization, including your own admin activity.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="audit-q">
                {t("admin.auditSearch")}
              </label>
              <Input
                id="audit-q"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder={t("admin.auditSearchPh", "Action, resource, user name, or email…")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    setQApplied(qDraft.trim());
                  }
                }}
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                setPage(1);
                setQApplied(qDraft.trim());
              }}
            >
              {t("patients.applyFilters", "Apply")}
            </Button>
          </div>

          {audit.isError ? (
            <p className="text-sm text-destructive">{audit.error instanceof Error ? audit.error.message : t("common.error")}</p>
          ) : null}

          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColWhen", "Time")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColActor", "User")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColAction", "Action")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.auditColResource", "Resource")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/50"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(r);
                      }
                    }}
                    onClick={() => setDetail(r)}
                  >
                    <td className="px-3 py-2 text-muted-foreground ltr-nums whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.actorDisplayName ?? r.actorEmail ?? "—"}</div>
                      {r.actorEmail && r.actorDisplayName ? (
                        <div className="text-xs text-muted-foreground">{r.actorEmail}</div>
                      ) : null}
                      {r.actorRole ? (
                        <div className="text-xs text-muted-foreground">{formatUserRole(r.actorRole, t)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.action}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.resource}
                      {r.resourceId ? <span className="block font-mono text-xs ltr-nums">{r.resourceId.slice(0, 12)}…</span> : null}
                    </td>
                  </tr>
                ))}
                {!audit.isPending && !rows.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      {t("admin.auditEmpty", "No audit rows match your filters.")}
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
              disabled={audit.isPending}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("admin.auditDetailTitle")}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">{t("admin.auditColAction", "Action")}: </span>
                <span className="font-medium">{detail.action}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{t("admin.auditColResource", "Resource")}: </span>
                {detail.resource} {detail.resourceId ? `· ${detail.resourceId}` : ""}
              </p>
              <p className="ltr-nums text-muted-foreground">{new Date(detail.createdAt).toISOString()}</p>
              <p>
                <span className="text-muted-foreground">{t("admin.auditColActor", "User")}: </span>
                {detail.actorDisplayName ?? "—"} ({detail.actorEmail ?? "—"})
                {detail.actorRole ? ` · ${formatUserRole(detail.actorRole, t)}` : ""}
              </p>
              {detail.clinicId ? (
                <p className="font-mono text-xs text-muted-foreground">
                  clinicId: {detail.clinicId}
                </p>
              ) : null}
              {metaStr ? (
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">{metaStr}</pre>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
