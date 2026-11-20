import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/search-input";
import { apiGet } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";
import { filterFieldClassName, filterToolbarCompactClassName, nativeSelectClassName } from "@/lib/form-control-styles";

type PlatformAuditRow = {
  id: string;
  tenantId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  actorDisplayName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
};

const ENTITY_OPTIONS = [
  { value: "", key: "all" },
  { value: "subscription", key: "subscription" },
  { value: "credit", key: "credit" },
  { value: "kiorly_invoice", key: "kiorly_invoice" },
  { value: "kiorex", key: "kiorex" },
  { value: "entitlement", key: "entitlement" },
  { value: "plan_price", key: "plan_price" },
  { value: "market", key: "market" },
  { value: "settlement", key: "settlement" },
  { value: "payment", key: "payment" },
] as const;

export function PlatformOrgAuditPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [entity, setEntity] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");

  const query = useQuery({
    queryKey: ["platform", "audit", tenantId, entity, page, pageSize, qApplied],
    queryFn: () => {
      const params = new URLSearchParams({
        tenantId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (entity) params.set("entity", entity);
      if (qApplied) params.set("q", qApplied);
      return apiGet<Paginated<PlatformAuditRow>>(`/api/v1/admin/platform/audit?${params.toString()}`);
    },
    enabled: Boolean(tenantId),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">{t("platform.audit.title", "Billing & plan audit")}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "platform.audit.subtitle",
          "Subscription, credits, invoices, Kiorex commissions, entitlements, and settlement events for this organization.",
        )}
      </p>
      <div className={filterToolbarCompactClassName}>
        <div className={filterFieldClassName}>
          <Label htmlFor="platform-audit-entity">{t("platform.audit.entityFilter", "Category")}</Label>
          <select
            id="platform-audit-entity"
            className={nativeSelectClassName}
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            {ENTITY_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {t(`platform.audit.entity.${opt.key}`, opt.key)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="platform-audit-q">{t("admin.auditSearch", "Search actions, resources, or people")}</Label>
          <SearchInput
            id="platform-audit-q"
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
          size="sm"
          onClick={() => {
            setPage(1);
            setQApplied(qDraft.trim());
          }}
        >
          {t("patients.applyFilters", "Apply")}
        </Button>
      </div>
      {query.isError ? (
        <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : t("common.error")}</p>
      ) : null}
      <ResponsiveTable>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("admin.auditColWhen", "Time")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("admin.auditColActor", "Employee")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("admin.auditColAction", "Action")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("admin.auditColResource", "Resource")}</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                  {t("admin.auditEmpty", "No audit rows match your filters.")}
                </td>
              </tr>
            ) : (
              rows.map((r: PlatformAuditRow) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap ltr-nums">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actorDisplayName ?? r.actorEmail ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-2">
                    {r.resource}
                    {r.resourceId ? <span className="text-muted-foreground"> · {r.resourceId.slice(0, 8)}…</span> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ResponsiveTable>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}