import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch } from "@/lib/http";
import { apiErrorMessage, type TenantDetail } from "@/features/platform/platform-shared";

export function PlatformOrgSettingsPanel({
  tenantId,
  onSaved,
}: {
  tenantId: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const normalizedTenantId = tenantId.trim();

  const [editName, setEditName] = useState("");
  const [editNameAr, setEditNameAr] = useState("");
  const [editCurrency, setEditCurrency] = useState("AED");
  const [editLocale, setEditLocale] = useState("en");
  const [editVisitFee, setEditVisitFee] = useState("");
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["platform", "tenant", normalizedTenantId],
    queryFn: () => apiGet<TenantDetail>(`/api/v1/admin/platform/tenants/${encodeURIComponent(normalizedTenantId)}`),
    enabled: Boolean(normalizedTenantId),
  });

  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditNameAr(detail.nameAr ?? "");
    setEditCurrency(detail.baseCurrency);
    setEditLocale(detail.defaultLocale);
    setEditVisitFee(String(detail.defaultVisitFee));
    setSettingsErr(null);
  }, [detail]);

  const patchBody = useMemo(() => {
    const body: Record<string, string | number> = {
      name: editName.trim(),
      baseCurrency: editCurrency,
      defaultLocale: editLocale.trim() || "en",
      defaultVisitFee: Number(editVisitFee) || 0,
    };
    const nameAr = editNameAr.trim();
    if (nameAr) body.nameAr = nameAr;
    return body;
  }, [editCurrency, editLocale, editName, editNameAr, editVisitFee]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!normalizedTenantId) {
      errors.push(t("platform.errorOrgNotSelected", "No organization selected."));
    }
    if (!editName.trim()) {
      errors.push(t("platform.errorOrgNameEn", "Organization name (English) is required."));
    }
    return errors;
  }, [editName, normalizedTenantId, t]);

  const patchMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/platform/tenants/${encodeURIComponent(normalizedTenantId)}`, patchBody),
    onSuccess: () => {
      setSettingsErr(null);
      toast.success(t("platform.orgSettingsSaved", "Organization settings saved."));
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
      onSaved?.();
    },
    onError: (e: unknown) => setSettingsErr(apiErrorMessage(e)),
  });

  const handleSave = () => {
    if (patchMut.isPending) return;
    if (validationErrors.length > 0) {
      toast.error(t("platform.orgSettingsValidationTitle", "Fix the form before saving organization settings"), {
        description: validationErrors.join("\n"),
      });
      return;
    }
    if (detailQuery.isError) {
      toast.error(apiErrorMessage(detailQuery.error));
      return;
    }
    patchMut.mutate();
  };

  if (!normalizedTenantId) {
    return <p className="text-sm text-destructive">{t("platform.errorOrgNotSelected", "No organization selected.")}</p>;
  }

  return (
    <div className="rounded-md border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("platform.orgSettings")}</h3>
      {detailQuery.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : detailQuery.isError ? (
        <p className="text-sm text-destructive">{apiErrorMessage(detailQuery.error)}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label required>{t("admin.nameEn", "Name (EN)")}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.nameAr", "Name (AR)")}</Label>
            <Input value={editNameAr} onChange={(e) => setEditNameAr(e.target.value)} dir="rtl" />
            {!editNameAr.trim() ? (
              <p className="text-xs text-muted-foreground">
                {t("platform.orgNameArOptionalHint", "Optional for existing organizations until an Arabic name is set.")}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{t("platform.baseCurrency")}</Label>
            <BaseCurrencySelect value={editCurrency} onChange={setEditCurrency} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultLocale")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={editLocale}
              onChange={(e) => setEditLocale(e.target.value)}
            >
              <option value="en">{t("common.english")}</option>
              <option value="ar">{t("common.arabic")}</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("platform.defaultVisitFee")}</Label>
            <Input type="number" min={0} className="max-w-xs" value={editVisitFee} onChange={(e) => setEditVisitFee(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="button" disabled={patchMut.isPending} onClick={handleSave}>
              {t("platform.saveSettings")}
            </Button>
            {settingsErr ? <p className="mt-2 text-sm text-destructive">{settingsErr}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
