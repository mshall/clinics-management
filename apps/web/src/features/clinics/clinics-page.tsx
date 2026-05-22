import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { FilterTh } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddClinicDialog } from "@/features/clinics/add-clinic-dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { columnFilterIncludes } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const CREATE_CLINIC_ROLES = new Set(["group_admin", "clinic_admin", "branch_manager"]);

export function ClinicsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const canCreateClinic = authUser?.role ? CREATE_CLINIC_ROLES.has(authUser.role) : false;
  const [addClinicOpen, setAddClinicOpen] = useState(false);
  const { data = [], isPending, isError, error } = useClinicsQuery();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cfKind, setCfKind] = useState("");
  const [cfName, setCfName] = useState("");
  const [cfCity, setCfCity] = useState("");

  const filtered = useMemo(() => {
    return data.filter((c) => {
      if (cfKind.trim()) {
        const kindHay = `${c.kind} parent branch ${t("clinics.parent")} ${t("clinics.branch")}`;
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
  }, [data, cfKind, cfName, cfCity, t]);

  useEffect(() => {
    setPage(1);
  }, [cfKind, cfName, cfCity]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("clinics.title")}</h1>
        <p className="text-muted-foreground">{t("clinics.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{i18n.language === "ar" ? "العيادات" : "Directory"}</CardTitle>
            <CardDescription>
              {isPending ? t("common.loading") : `${filtered.length} / ${data.length} ${i18n.language === "ar" ? "سجل" : "records"}`}
            </CardDescription>
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
            {canCreateClinic ? (
              <CreateActionButton type="button" onClick={() => setAddClinicOpen(true)}>
                {t("admin.openAddClinic", "Add clinic…")}
              </CreateActionButton>
            ) : null}
          </div>
        </CardHeader>
        {canCreateClinic ? <AddClinicDialog open={addClinicOpen} onOpenChange={setAddClinicOpen} /> : null}
        <CardContent className="space-y-3">
          {isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.comingSoon")}</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-start">
                      <FilterTh label={`${t("clinics.parent")} / ${t("clinics.branch")}`} value={cfKind} onChange={setCfKind} />
                      <FilterTh
                        label={i18n.language === "ar" ? "الاسم (عربي)" : "Name (EN)"}
                        value={cfName}
                        onChange={setCfName}
                      />
                      <FilterTh label={i18n.language === "ar" ? "المدينة" : "City"} value={cfCity} onChange={setCfCity} />
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
                          <Badge variant={c.kind === "parent" ? "default" : "outline"}>
                            {c.kind === "parent" ? t("clinics.parent") : t("clinics.branch")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {i18n.language === "ar" ? (
                            <span>{c.nameAr}</span>
                          ) : (
                            <span>{c.nameEn}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c.city}, {c.country}
                        </td>
                      </tr>
                    ))}
                    {!isPending && data.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                          {t("common.comingSoon")}
                        </td>
                      </tr>
                    ) : null}
                    {!isPending && data.length > 0 && filtered.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                          {t("patients.noColMatch", "No rows match the column filters.")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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
