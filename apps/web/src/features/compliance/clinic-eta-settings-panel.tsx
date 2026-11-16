import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClinicDetailDto } from "@/lib/api-types";
import { apiPatch } from "@/lib/http";
import { useOrgEtaPhysicalOptOut } from "@/lib/use-org-eta-opt-out";

type Props = {
  clinicId: string;
  detail: ClinicDetailDto;
  disabled?: boolean;
};

export function ClinicEtaSettingsPanel({ clinicId, detail, disabled }: Props) {
  const { t } = useTranslation();
  const { optOut, isLoading } = useOrgEtaPhysicalOptOut();
  const [branch, setBranch] = useState(detail.etaBranchCode ?? "");
  const [activity, setActivity] = useState(detail.etaTaxpayerActivityCode ?? "");
  const [itemCode, setItemCode] = useState(detail.etaDefaultItemCode ?? "");
  const [enabled, setEnabled] = useState(detail.etaReceiptsEnabled !== false);
  const [showLogo, setShowLogo] = useState(detail.etaIncludeLogoOnReceipt !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBranch(detail.etaBranchCode ?? "");
    setActivity(detail.etaTaxpayerActivityCode ?? "");
    setItemCode(detail.etaDefaultItemCode ?? "");
    setEnabled(detail.etaReceiptsEnabled !== false);
    setShowLogo(detail.etaIncludeLogoOnReceipt !== false);
  }, [detail, clinicId]);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/v1/compliance/clinics/${clinicId}/eta-settings`, {
        etaBranchCode: branch.trim() || null,
        etaTaxpayerActivityCode: activity.trim() || null,
        etaDefaultItemCode: itemCode.trim() || null,
        etaReceiptsEnabled: enabled,
        etaIncludeLogoOnReceipt: showLogo,
      });
      toast.success(t("compliance.etaClinicSaved", "ETA clinic settings saved."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!isLoading && optOut) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("compliance.etaClinicTitle", "Egypt ETA (e-receipt)")}</CardTitle>
          <CardDescription>{t("compliance.etaClinicOrgDisabled", "Organization ETA integration is off.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("compliance.etaOrgSelfReporting")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("compliance.etaClinicTitle", "Egypt ETA (e-receipt)")}</CardTitle>
        <CardDescription>
          {t(
            "compliance.etaClinicDescEnabled",
            "Branch code, activity, and item codes for this clinic. Organization defaults and API credentials are under Administration → Organization & settings.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="eta-branch">{t("compliance.etaBranchCode", "Branch / POS code")}</Label>
          <Input id="eta-branch" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eta-activity">{t("compliance.etaActivity", "Activity code")}</Label>
          <Input id="eta-activity" className="ltr-nums" value={activity} onChange={(e) => setActivity(e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="eta-item">{t("compliance.etaItemCode", "Default service item code")}</Label>
          <Input id="eta-item" value={itemCode} onChange={(e) => setItemCode(e.target.value)} disabled={disabled} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={disabled} />
          {t("compliance.etaQueueEnabled", "Queue ETA e-receipts for payments at this clinic")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} disabled={disabled} />
          {t("compliance.etaShowLogo", "Show invoice logo on patient receipt preview (when ETA permits issuer branding)")}
        </label>
        <div className="sm:col-span-2">
          <Button type="button" disabled={disabled || saving} onClick={() => void save()}>
            {t("common.save", "Save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}