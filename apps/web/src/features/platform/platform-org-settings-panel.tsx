import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editVisitFee, setEditVisitFee] = useState("");
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["platform", "tenant", tenantId],
    queryFn: () => apiGet<TenantDetail>(`/api/v1/admin/platform/tenants/${tenantId}`),
  });

  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditCurrency(detail.baseCurrency);
    setEditLocale(detail.defaultLocale);
    setEditVisitFee(String(detail.defaultVisitFee));
  }, [detail]);

  const patchMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/platform/tenants/${tenantId}`, {
        name: editName.trim(),
        baseCurrency: editCurrency.trim(),
        defaultLocale: editLocale.trim(),
        defaultVisitFee: Number(editVisitFee) || 0,
      }),
    onSuccess: () => {
      setSettingsErr(null);
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
      onSaved?.();
    },
    onError: (e: unknown) => setSettingsErr(apiErrorMessage(e)),
  });

  return (
    <div className="rounded-md border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("platform.orgSettings")}</h3>
      {detailQuery.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("platform.orgName")}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.baseCurrency")}</Label>
            <Input value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultLocale")}</Label>
            <Input value={editLocale} onChange={(e) => setEditLocale(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultVisitFee")}</Label>
            <Input type="number" min={0} value={editVisitFee} onChange={(e) => setEditVisitFee(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="button" disabled={patchMut.isPending} onClick={() => patchMut.mutate()}>
              {t("platform.saveSettings")}
            </Button>
            {settingsErr ? <p className="mt-2 text-sm text-destructive">{settingsErr}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
