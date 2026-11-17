import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch } from "@/lib/http";
import { apiErrorMessage } from "@/features/platform/platform-shared";

type TenantEtaDetail = {
  marketCode?: string | null;
  etaPlatformIntegrationEnabled?: boolean;
  etaPhysicalReportingOptOut?: boolean;
};

export function PlatformOrgEtaIntegrationPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [integrationOn, setIntegrationOn] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["platform", "tenant", tenantId, "eta"],
    queryFn: () => apiGet<TenantEtaDetail>(`/api/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}`),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    setIntegrationOn(detailQuery.data.etaPlatformIntegrationEnabled === true);
  }, [detailQuery.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/eta-integration`, {
        enabled: integrationOn,
      }),
    onSuccess: async () => {
      toast.success(t("platform.etaIntegrationSaved", "ETA integration setting saved."));
      await qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] });
      await qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId, "eta"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (detailQuery.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (detailQuery.data?.marketCode !== "EG") {
    return (
      <p className="text-sm text-muted-foreground">
        {t("platform.etaIntegrationEgOnly", "Kiorly ETA integration is only available for Egypt market organizations.")}
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-semibold">{t("platform.etaIntegrationTitle", "ETA e-invoice integration")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "platform.etaIntegrationDesc",
            "Off by default for new organizations. When enabled, Kiorly ETA settings appear for the clinic group and integration is turned on until they opt out.",
          )}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "platform.etaTaxResponsibilityNote",
            "Clinics and physicians remain solely responsible for submitting taxes and receipts to the Egyptian Tax Authority, whether or not Kiorly integration is enabled.",
          )}
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={integrationOn}
          onChange={(e) => setIntegrationOn(e.target.checked)}
        />
        <span>
          <Label className="font-normal">{t("platform.etaIntegrationEnable", "Enable Kiorly ETA for this organization")}</Label>
        </span>
      </label>
      <Button type="button" size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
        {t("common.save", "Save")}
      </Button>
    </div>
  );
}