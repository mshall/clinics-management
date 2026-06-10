import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm, isClinicFormComplete, type ClinicFormValues } from "@/features/clinics/clinic-form-utils";
import { PlatformOrgSettingsPanel } from "@/features/platform/platform-org-settings-panel";
import { apiErrorMessage, type TenantRow } from "@/features/platform/platform-shared";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";
import { apiGet, apiPost } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";

type DialogMode = null | "create" | { edit: string };

export function PlatformOrganizationsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const [tenantName, setTenantName] = useState("");
  const [tenantNameAr, setTenantNameAr] = useState("");
  const [tenantCurrency, setTenantCurrency] = useState("AED");
  const [tenantLocale, setTenantLocale] = useState("en");
  const [gaEmail, setGaEmail] = useState("");
  const [gaPassword, setGaPassword] = useState("");
  const [gaName, setGaName] = useState("");
  const [hqForm, setHqForm] = useState<ClinicFormValues>(emptyClinicForm());
  const [createOrgWithHq, setCreateOrgWithHq] = useState(false);
  const [tenantErr, setTenantErr] = useState<string | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<Paginated<TenantRow>>("/api/v1/admin/platform/tenants?page=1&pageSize=200&sortBy=name&sortOrder=asc"),
  });

  const tenantRows = tenantsQuery.data?.items ?? [];
  const editTenantId = dialogMode && typeof dialogMode === "object" ? dialogMode.edit : null;
  const editRow = editTenantId ? tenantRows.find((r) => r.id === editTenantId) : null;

  const resetCreateForm = () => {
    setTenantName("");
    setTenantNameAr("");
    setTenantCurrency("AED");
    setTenantLocale("en");
    setGaEmail("");
    setGaPassword("");
    setGaName("");
    setHqForm(emptyClinicForm());
    setCreateOrgWithHq(false);
    setTenantErr(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setDialogMode("create");
  };

  const closeDialog = () => setDialogMode(null);

  const createTenantMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: tenantName.trim(),
        nameAr: tenantNameAr.trim(),
        baseCurrency: tenantCurrency,
        defaultLocale: tenantLocale.trim() || "en",
        groupAdmin: { email: gaEmail.trim(), password: gaPassword, displayName: gaName.trim() },
      };
      if (createOrgWithHq) body.initialClinic = clinicFormToCreatePayload(hqForm, { includeParent: false });
      return apiPost<{ id: string }>("/api/v1/admin/platform/tenants", body);
    },
    onSuccess: (row: { id: string }) => {
      setTenantErr(null);
      resetCreateForm();
      setDialogMode({ edit: row.id });
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setTenantErr(apiErrorMessage(e)),
  });

  const canCreateOrg =
    tenantName.trim() &&
    tenantNameAr.trim() &&
    gaEmail.trim() &&
    gaPassword.length >= 8 &&
    gaName.trim() &&
    (!createOrgWithHq || isClinicFormComplete(hqForm));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("platform.organizations")}</CardTitle>
            <CardDescription>{t("platform.orgTableHint")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrgHierarchyPanel
              scope="platform"
              selectedId={editTenantId ?? undefined}
              onSelectNode={(node) => {
                if (node.nodeType === "organization") setDialogMode({ edit: node.id });
              }}
            />
            <Button type="button" onClick={openCreate}>
              {t("platform.tabs.createOrg")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tenantsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("platform.orgName")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.clinics")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.users")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.patients")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
                      onClick={() => setDialogMode({ edit: row.id })}
                    >
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.clinics}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.users}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.patients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogMode === "create"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("platform.tabs.createOrg")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.nameEn", "Name (EN)")}</Label>
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.nameAr", "Name (AR)")}</Label>
              <Input value={tenantNameAr} onChange={(e) => setTenantNameAr(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{t("platform.baseCurrency")}</Label>
              <BaseCurrencySelect value={tenantCurrency} onChange={setTenantCurrency} />
            </div>
            <div className="space-y-2">
              <Label>{t("platform.defaultLocale")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tenantLocale}
                onChange={(e) => setTenantLocale(e.target.value)}
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
            <div className="md:col-span-2 rounded-md border border-border p-4 space-y-3">
              <p className="text-sm font-medium">{t("platform.groupAdminSection")}</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-end">
                <div className="space-y-2">
                  <Label>{t("platform.groupAdminEmail")}</Label>
                  <Input type="email" value={gaEmail} onChange={(e) => setGaEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("auth.password")}</Label>
                  <PasswordInput value={gaPassword} onChange={setGaPassword} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.displayName")}</Label>
                  <Input value={gaName} onChange={(e) => setGaName(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createOrgWithHq} onChange={(e) => setCreateOrgWithHq(e.target.checked)} />
                {t("platform.createInitialHq")}
              </label>
              {createOrgWithHq ? (
                <div className="rounded-md border border-border p-4">
                  <ClinicFormFields idPrefix="hq-create" values={hqForm} onChange={(p) => setHqForm((v) => ({ ...v, ...p }))} />
                </div>
              ) : null}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button type="button" disabled={!canCreateOrg || createTenantMut.isPending} onClick={() => createTenantMut.mutate()}>
                {t("platform.createOrgBtn")}
              </Button>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
            </div>
            {tenantErr ? <p className="md:col-span-2 text-sm text-destructive">{tenantErr}</p> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTenantId)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editRow?.name ?? t("platform.orgDetails")}</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              {[
                { label: t("admin.clinics"), value: editRow.counts.clinics },
                { label: t("admin.users"), value: editRow.counts.users },
                { label: t("platform.patients"), value: editRow.counts.patients },
              ].map((k) => (
                <div key={k.label} className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="font-semibold ltr-nums">{k.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {editTenantId ? <PlatformOrgSettingsPanel tenantId={editTenantId} onSaved={closeDialog} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
