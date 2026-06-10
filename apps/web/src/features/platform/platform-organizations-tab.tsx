import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm, hasPartialClinicForm, isClinicFormComplete, type ClinicFormValues } from "@/features/clinics/clinic-form-utils";
import { PlatformOrgSettingsPanel } from "@/features/platform/platform-org-settings-panel";
import { apiErrorMessage, type TenantRow } from "@/features/platform/platform-shared";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";
import { apiGet, apiPost } from "@/lib/http";
import { cn } from "@/lib/utils";
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
      if (createOrgWithHq && isClinicFormComplete(hqForm)) {
        body.initialClinic = clinicFormToCreatePayload(hqForm, { includeParent: false });
      }
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

  const passwordTooShort = gaPassword.length > 0 && gaPassword.length < 8;
  const partialClinic = createOrgWithHq && hasPartialClinicForm(hqForm);

  const collectCreateOrgErrors = useCallback((): string[] => {
    const errors: string[] = [];
    if (!tenantName.trim()) {
      errors.push(t("platform.errorOrgNameEn", "Organization name (English) is required."));
    }
    if (!tenantNameAr.trim()) {
      errors.push(t("platform.errorOrgNameAr", "Organization name (Arabic) is required."));
    }
    if (!gaEmail.trim()) {
      errors.push(t("platform.errorGroupAdminEmail", "Group admin email is required."));
    }
    if (!gaPassword.trim()) {
      errors.push(t("platform.errorGroupAdminPassword", "Group admin password is required."));
    } else if (gaPassword.length < 8) {
      errors.push(t("platform.groupAdminPasswordMin", "Group admin password must be at least 8 characters."));
    }
    if (!gaName.trim()) {
      errors.push(t("platform.errorGroupAdminName", "Group admin display name is required."));
    }
    if (partialClinic) {
      errors.push(
        t(
          "platform.partialClinicBlocked",
          "Complete all required clinic fields or clear them — a partial clinic cannot be saved.",
        ),
      );
    }
    return errors;
  }, [gaEmail, gaName, gaPassword, partialClinic, t, tenantName, tenantNameAr]);

  const canCreateOrg = collectCreateOrgErrors().length === 0;

  const handleCreateOrg = () => {
    if (createTenantMut.isPending) return;
    const errors = collectCreateOrgErrors();
    if (errors.length > 0) {
      toast.error(t("platform.createOrgValidationTitle", "Complete the form to create the organization"), {
        description: errors.join("\n"),
        duration: 8000,
      });
      return;
    }
    createTenantMut.mutate();
  };

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
                {t("platform.createInitialHqOptional", "Optionally add a first clinic (leave unchecked to skip)")}
              </label>
              {createOrgWithHq ? (
                <div className="rounded-md border border-border p-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    {t(
                      "platform.createInitialHqHint",
                      "Fill all required clinic fields to provision a clinic now, or leave them blank and add clinics later from the Clinics tab.",
                    )}
                  </p>
                  <ClinicFormFields idPrefix="hq-create" values={hqForm} onChange={(p) => setHqForm((v) => ({ ...v, ...p }))} />
                </div>
              ) : null}
              {partialClinic ? (
                <p className="text-sm text-destructive">
                  {t(
                    "platform.partialClinicBlocked",
                    "Complete all required clinic fields or clear them — a partial clinic cannot be saved.",
                  )}
                </p>
              ) : null}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={createTenantMut.isPending}
                className={cn(!canCreateOrg && !createTenantMut.isPending && "opacity-60")}
                onClick={handleCreateOrg}
              >
                {t("platform.createOrgBtn")}
              </Button>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
            </div>
            {passwordTooShort ? (
              <p className="md:col-span-2 text-sm text-destructive">
                {t("platform.groupAdminPasswordMin", "Group admin password must be at least 8 characters.")}
              </p>
            ) : null}
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
