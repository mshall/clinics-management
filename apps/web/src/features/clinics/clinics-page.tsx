import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { FilterTh } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddClinicDialog } from "@/features/clinics/add-clinic-dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { columnFilterIncludes } from "@/lib/utils";
import { formatClinicName } from "@/lib/locale-display";
import { clinicKindLabel } from "@/lib/clinic-kind";
import { useAuthStore } from "@/stores/auth-store";

const MANAGE_CLINIC_ROLES = new Set(["group_admin", "clinic_admin", "branch_manager"]);

export function ClinicsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const canManageClinic = authUser?.role ? MANAGE_CLINIC_ROLES.has(authUser.role) : false;
  const [clinicView, setClinicView] = useState<"active" | "disabled">("active");
  const [addClinicOpen, setAddClinicOpen] = useState(false);
  const { data = [], isPending, isError, error } = useClinicsQuery({
    includeInactive: clinicView === "disabled",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cfKind, setCfKind] = useState("");
  const [cfName, setCfName] = useState("");
  const [cfCity, setCfCity] = useState("");

  const viewRows = useMemo(() => {
    if (clinicView === "disabled") {
      return data.filter((c) => c.recordStatus === "INACTIVE");
    }
    return data.filter((c) => c.recordStatus !== "INACTIVE");
  }, [data, clinicView]);

  const filtered = useMemo(() => {
    return viewRows.filter((c) => {
      if (cfKind.trim()) {
        const kindHay = `${c.kind} parent branch standalone ${t("clinics.parent")} ${t("clinics.branch")} ${t("clinics.standalone", "Clinic")}`;
        if (!columnFilterIncludes(kindHay, cfKind)) return false;
      }
      if (cfName.trim()) {
        const nameHay = `${c.nameEn} ${c.nameAr}`;
        if (!columnFilterIncludes(nameHay, cfName)) return false;
      }
      if (cfCity.trim()) {
        const locHay = `${c.city} ${c.country}`;
        if (!columnFilterIncludes(locHay, cfCity)) return false;
      }
      return true;
    });
  }, [viewRows, cfKind, cfName, cfCity, t]);

  useEffect(() => {
    setPage(1);
  }, [cfKind, cfName, cfCity, clinicView]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const formatWhen = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString() : t("clinics.notApplicable", "—");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("clinics.title")}</h1>
        <p className="text-muted-foreground">{t("clinics.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("clinics.directory")}</CardTitle>
            <CardDescription>
              {isPending ? t("common.loading") : `${filtered.length} / ${viewRows.length} ${t("clinics.records")}`}
            </CardDescription>
            {canManageClinic ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={clinicView === "active" ? "default" : "outline"}
                  onClick={() => setClinicView("active")}
                >
                  {t("clinics.activeTab", "Active clinics")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={clinicView === "disabled" ? "default" : "outline"}
                  onClick={() => setClinicView("disabled")}
                >
                  {t("clinics.disabledTab", "Disabled clinics")}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={!cfKind.trim() && !cfName.trim() && !cfCity.trim()}
              onClick={() => {
                setCfKind("");
                setCfName("");
                setCfCity("");
              }}
            >
              {t("patients.clearColFilters", "Clear column filters")}
            </Button>
            {canManageClinic && clinicView === "active" ? (
              <CreateActionButton type="button" onClick={() => setAddClinicOpen(true)}>
                {t("admin.openAddClinic", "Add clinic…")}
              </CreateActionButton>
            ) : null}
          </div>
        </CardHeader>
        {canManageClinic ? <AddClinicDialog open={addClinicOpen} onOpenChange={setAddClinicOpen} /> : null}
        <CardContent className="space-y-3">
          {isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.comingSoon")}</p>
          ) : (
            <>
              <ResponsiveTable>
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <FilterTh label={`${t("clinics.parent")} / ${t("clinics.branch")}`} value={cfKind} onChange={setCfKind} />
                      <FilterTh
                        label={i18n.language === "ar" ? t("clinics.nameColumnAr") : t("clinics.nameColumnEn")}
                        value={cfName}
                        onChange={setCfName}
                      />
                      <FilterTh label={t("clinics.cityColumn")} value={cfCity} onChange={setCfCity} />
                      {clinicView === "disabled" ? (
                        <>
                          <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                            {t("clinics.createdAt", "Created")}
                          </th>
                          <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                            {t("clinics.disabledAt", "Disabled")}
                          </th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-t border-border hover:bg-muted/50"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/clinics/${c.id}`);
                          }
                        }}
                        onClick={() => navigate(`/clinics/${c.id}`)}
                      >
                        <td className="px-3 py-2">
                          <Badge variant={c.kind === "branch" ? "outline" : c.kind === "parent" ? "default" : "secondary"}>
                            {clinicKindLabel(c.kind, t)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{formatClinicName(c, i18n.language)}</span>
                            {c.recordStatus === "INACTIVE" ? (
                              <Badge variant="outline">{t("clinics.disabledBadge", "Disabled")}</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c.city}, {c.country}
                        </td>
                        {clinicView === "disabled" ? (
                          <>
                            <td className="px-3 py-2 text-xs text-muted-foreground ltr-nums">{formatWhen(c.createdAt)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground ltr-nums">{formatWhen(c.disabledAt)}</td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                    {!isPending && viewRows.length === 0 ? (
                      <tr>
                        <td colSpan={clinicView === "disabled" ? 5 : 3} className="px-3 py-6 text-center text-muted-foreground">
                          {clinicView === "disabled"
                            ? t("clinics.noDisabledClinics", "No disabled clinics.")
                            : t("common.comingSoon")}
                        </td>
                      </tr>
                    ) : null}
                    {!isPending && viewRows.length > 0 && filtered.length === 0 ? (
                      <tr>
                        <td colSpan={clinicView === "disabled" ? 5 : 3} className="px-3 py-6 text-center text-muted-foreground">
                          {t("patients.noColMatch", "No rows match the column filters.")}
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
                  disabled={isPending}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
