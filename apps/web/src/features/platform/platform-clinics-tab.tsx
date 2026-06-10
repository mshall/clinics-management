import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PickListItem } from "@/components/searchable-pick-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import {
  clinicDetailToForm,
  clinicFormToCreatePayload,
  emptyClinicForm,
  isClinicFormComplete,
  type ClinicFormValues,
} from "@/features/clinics/clinic-form-utils";
import { apiErrorMessage, type PlatformClinicRow, type TenantRow } from "@/features/platform/platform-shared";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";
import { apiGet, apiPatch, apiPost } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";

type ClinicDetail = PlatformClinicRow & {
  tenantName?: string;
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  logoUrl: string | null;
  licenseNumber: string;
  defaultLanguage: string;
};

type DialogMode = null | "create" | { edit: { clinicId: string; tenantId: string } };

export function PlatformClinicsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [filterTenantId, setFilterTenantId] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const [createTenantId, setCreateTenantId] = useState("");
  const [form, setForm] = useState<ClinicFormValues>(emptyClinicForm());
  const [clErr, setClErr] = useState<string | null>(null);

  const editSelection = dialogMode && typeof dialogMode === "object" ? dialogMode.edit : null;
  const isCreate = dialogMode === "create";
  const isEdit = Boolean(editSelection);
  const dialogOpen = isCreate || isEdit;

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<Paginated<TenantRow>>("/api/v1/admin/platform/tenants?page=1&pageSize=200&sortBy=name&sortOrder=asc"),
  });

  const clinicsQuery = useQuery({
    queryKey: ["platform", "all-clinics", filterTenantId],
    queryFn: () => {
      const q = filterTenantId ? `?tenantId=${encodeURIComponent(filterTenantId)}` : "";
      return apiGet<PlatformClinicRow[]>(`/api/v1/admin/platform/clinics${q}`);
    },
  });

  const tenantRows = tenantsQuery.data?.items ?? [];
  const clinicRows = clinicsQuery.data ?? [];

  const activeTenantId = isEdit ? (editSelection?.tenantId ?? "") : createTenantId;

  const orgClinicsQuery = useQuery({
    queryKey: ["platform", "clinics", activeTenantId],
    queryFn: () => apiGet<{ id: string; nameEn: string; kind: string }[]>(`/api/v1/admin/platform/tenants/${activeTenantId}/clinics`),
    enabled: Boolean(activeTenantId) && isCreate,
  });

  const clinicDetailQuery = useQuery({
    queryKey: ["platform", "clinic-detail", editSelection?.tenantId, editSelection?.clinicId],
    queryFn: () =>
      apiGet<ClinicDetail>(`/api/v1/admin/platform/tenants/${editSelection!.tenantId}/clinics/${editSelection!.clinicId}`),
    enabled: isEdit && Boolean(editSelection?.tenantId && editSelection?.clinicId),
  });

  const parentClinicItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("platform.newParentClinic") },
      ...(orgClinicsQuery.data ?? []).filter((c) => c.kind === "parent").map((c) => ({ value: c.id, label: c.nameEn })),
    ],
    [orgClinicsQuery.data, t],
  );

  useEffect(() => {
    if (!isEdit || !clinicDetailQuery.data) return;
    setForm(clinicDetailToForm(clinicDetailQuery.data));
  }, [isEdit, clinicDetailQuery.data]);

  const resetCreate = () => {
    setCreateTenantId("");
    setForm(emptyClinicForm());
    setClErr(null);
  };

  const openCreate = () => {
    resetCreate();
    setDialogMode("create");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setClErr(null);
  };

  const createMut = useMutation({
    mutationFn: () => apiPost(`/api/v1/admin/platform/tenants/${createTenantId}/clinics`, clinicFormToCreatePayload(form)),
    onSuccess: () => {
      setClErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setClErr(apiErrorMessage(e)),
  });

  const patchMut = useMutation({
    mutationFn: () =>
      apiPatch(
        `/api/v1/admin/platform/tenants/${editSelection!.tenantId}/clinics/${editSelection!.clinicId}`,
        clinicFormToCreatePayload(form, { includeParent: false }),
      ),
    onSuccess: () => {
      setClErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setClErr(apiErrorMessage(e)),
  });

  const editRow = editSelection ? clinicRows.find((c) => c.id === editSelection.clinicId) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("platform.tabs.clinicsList")}</CardTitle>
            <CardDescription>{t("platform.tabs.clinicsListHint")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrgHierarchyPanel
              scope="platform"
              tenantId={filterTenantId || undefined}
              selectedId={editSelection?.clinicId}
              onSelectNode={(node) => {
                if (node.nodeType === "clinic") {
                  const row = clinicRows.find((r) => r.id === node.id);
                  if (row) setDialogMode({ edit: { clinicId: node.id, tenantId: row.tenantId } });
                } else if (node.nodeType === "organization") {
                  setFilterTenantId(node.id);
                }
              }}
            />
            <Button type="button" onClick={openCreate}>
              {t("platform.tabs.newClinic")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-w-[12rem] max-w-xs space-y-2">
            <Label>{t("platform.tabs.filterOrg")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterTenantId}
              onChange={(e) => setFilterTenantId(e.target.value)}
            >
              <option value="">{t("platform.tabs.allOrgs")}</option>
              {tenantRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          {clinicsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("platform.orgName")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.nameEn")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.city")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.tabs.kind")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.phone")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clinicRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => setDialogMode({ edit: { clinicId: row.id, tenantId: row.tenantId } })}
                    >
                      <td className="px-3 py-2">{row.tenantName}</td>
                      <td className="px-3 py-2 font-medium">{row.nameEn}</td>
                      <td className="px-3 py-2">{row.city}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.kind === "parent" ? "default" : "secondary"}>{row.kind}</Badge>
                      </td>
                      <td className="px-3 py-2 ltr-nums">{row.phone ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("platform.tabs.editClinic") : t("platform.addClinic")}
              {isEdit && editRow ? ` — ${editRow.nameEn}` : ""}
            </DialogTitle>
          </DialogHeader>

          {isEdit && clinicDetailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="space-y-4">
              {isCreate ? (
                <div className="space-y-2">
                  <Label>{t("platform.orgName")}</Label>
                  <select
                    className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createTenantId}
                    onChange={(e) => {
                      setCreateTenantId(e.target.value);
                      setForm(emptyClinicForm());
                    }}
                  >
                    <option value="">{t("platform.tabs.pickOrg")}</option>
                    {tenantRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("platform.orgName")}:{" "}
                  <span className="font-medium text-foreground">
                    {clinicDetailQuery.data?.tenantName ?? editRow?.tenantName}
                  </span>
                </p>
              )}

              {(isCreate && !createTenantId) ? (
                <p className="text-sm text-muted-foreground">{t("platform.tabs.pickOrgFirst")}</p>
              ) : (
                <>
                  <ClinicFormFields
                    idPrefix={isEdit ? "edit-clinic" : "new-clinic"}
                    values={form}
                    onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                    showParentPicker={isCreate}
                    parentClinicItems={parentClinicItems}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!isClinicFormComplete(form) || createMut.isPending || patchMut.isPending}
                      onClick={() => (isCreate ? createMut.mutate() : patchMut.mutate())}
                    >
                      {isEdit ? t("platform.saveClinic") : t("admin.saveClinic")}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              )}
              {clErr ? <p className="text-sm text-destructive">{clErr}</p> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
