import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOverviewQuery } from "@/lib/api-hooks";
import { ApiError, apiPatch } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

export function OrgEtaIntegrationCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshSession = useAuthStore((s) => s.refreshSessionFromServer);
  const overview = useAdminOverviewQuery();
  const tenant = overview.data?.currentTenant;
  const platformEnabled =
    (tenant as { etaPlatformIntegrationEnabled?: boolean } | undefined)?.etaPlatformIntegrationEnabled === true;

  const [integrationEnabled, setIntegrationEnabled] = useState(false);
  const [disableConsent, setDisableConsent] = useState(false);
  const [activity, setActivity] = useState("8690");
  const [itemCode, setItemCode] = useState("");
  const [sealLabel, setSealLabel] = useState("");

  useEffect(() => {
    const row = tenant as
      | {
          etaDefaultTaxpayerActivityCode?: string;
          etaDefaultItemCode?: string | null;
          etaEsignatureLabel?: string | null;
          etaPhysicalReportingOptOut?: boolean;
        }
      | undefined;
    if (!row) return;
    const optOut = row.etaPhysicalReportingOptOut === true;
    setIntegrationEnabled(!optOut);
    if (optOut) setDisableConsent(true);
    if (row.etaDefaultTaxpayerActivityCode) setActivity(row.etaDefaultTaxpayerActivityCode);
    if (row.etaDefaultItemCode != null) setItemCode(row.etaDefaultItemCode ?? "");
    if (row.etaEsignatureLabel != null) setSealLabel(row.etaEsignatureLabel ?? "");
  }, [tenant]);

  const saveMut = useMutation({
    mutationFn: () => {
      const optOut = !integrationEnabled;
      if (optOut && !disableConsent) {
        throw new Error(t("compliance.etaPhysicalConsentRequired"));
      }
      return apiPatch("/api/v1/admin/tenant-settings", {
        etaDefaultTaxpayerActivityCode: activity.trim() || "8690",
        etaDefaultItemCode: itemCode.trim() || null,
        etaEsignatureLabel: sealLabel.trim() || null,
        etaPhysicalReportingOptOut: optOut,
        ...(optOut
          ? { etaPhysicalReportingConsentAt: new Date().toISOString() }
          : { etaPhysicalReportingConsentAt: null }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      await qc.invalidateQueries({ queryKey: ["admin", "overview", "eta-opt-out"] });
      await qc.invalidateQueries({ queryKey: ["clinics"] });
      await refreshSession();
      toast.success(t("compliance.etaOrgIntegrationSaved", "ETA integration settings saved."));
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        toast.error(String((e.body as { message?: unknown }).message));
      } else toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  if (overview.isSuccess && !platformEnabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("compliance.etaOrgIntegrationTitle", "ETA e-invoice integration")}
        </CardTitle>
        <CardDescription>
          {t(
            "compliance.etaOrgIntegrationDesc",
            "When enabled, Kiorly queues electronic tax receipts for payments. Configure each clinic under Clinics → Settings.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={integrationEnabled}
            onChange={(e) => {
              setIntegrationEnabled(e.target.checked);
              if (e.target.checked) setDisableConsent(false);
            }}
          />
          <span>{t("compliance.etaOrgIntegrationEnable", "Enable Kiorly ETA e-receipt integration for this organization")}</span>
        </label>

        {!integrationEnabled ? (
          <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t(
              "compliance.etaOrgSelfReporting",
              "Integration is off. Your organization is responsible for submitting receipts and invoices to the Egyptian Tax Authority through your own ETA-registered process or approved exemption.",
            )}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("compliance.orgEtaHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-eta-activity">{t("compliance.etaActivity", "Default activity code")}</Label>
                <Input
                  id="org-eta-activity"
                  className="ltr-nums w-full"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-eta-item">{t("compliance.etaItemCode", "Default item code")}</Label>
                <Input id="org-eta-item" className="w-full" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="org-eta-seal">{t("compliance.etaSealLabel", "E-signature / seal reference")}</Label>
                <Input
                  id="org-eta-seal"
                  className="w-full"
                  value={sealLabel}
                  onChange={(e) => setSealLabel(e.target.value)}
                  placeholder="kiorly-clinics-management/eta-credentials"
                />
              </div>
            </div>
          </>
        )}

        {!integrationEnabled ? (
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={disableConsent}
              onChange={(e) => setDisableConsent(e.target.checked)}
            />
            <span>{t("compliance.etaPhysicalConsent")}</span>
          </label>
        ) : null}

        <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
          {t("common.save", "Save")}
        </Button>
      </CardContent>
    </Card>
  );
}