import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClinicDetailDto } from "@/lib/api-types";
import { ApiError, apiPatch } from "@/lib/http";
import { usePatchClinicInvoiceSettingsMutation } from "@/lib/invoice-hooks";
import { pickMarketTaxLabel } from "@/lib/market-tax-labels";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type Props = {
  clinicId: string;
  detail: ClinicDetailDto;
  canEdit: boolean;
};

export function ClinicRegulatorySettingsPanel({ clinicId, detail, canEdit }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const invoiceMut = usePatchClinicInvoiceSettingsMutation(clinicId);
  const lang = i18n.language === "ar" ? "ar" : "en";
  const labels = detail.marketTaxLabels;
  const taxLabel = pickMarketTaxLabel(labels, "taxRegistration", lang);
  const licenseLabel = pickMarketTaxLabel(labels, "license", lang);
  const authorityName = labels
    ? lang === "ar"
      ? labels.taxAuthorityNameAr
      : labels.taxAuthorityNameEn
    : null;

  const [license, setLicense] = useState(detail.licenseNumber);
  const [taxReg, setTaxReg] = useState(detail.taxRegistrationNumber ?? "");
  const [vatPercent, setVatPercent] = useState(String(detail.invoiceVatPercent ?? 0));
  const [vatOverride, setVatOverride] = useState(!detail.invoiceVatPercentUsesMarketDefault);

  useSyncOnChange([detail.licenseNumber, detail.taxRegistrationNumber, detail.invoiceVatPercent, detail.invoiceVatPercentUsesMarketDefault, detail.marketInvoiceVatPercent], () => {
    setLicense(detail.licenseNumber);
    setTaxReg(detail.taxRegistrationNumber ?? "");
    setVatOverride(!detail.invoiceVatPercentUsesMarketDefault);
    const v = detail.invoiceVatPercentUsesMarketDefault
      ? (detail.marketInvoiceVatPercent ?? detail.invoiceVatPercent)
      : detail.invoiceVatPercent;
    setVatPercent(String(v ?? 0));
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const vatN = Number.parseFloat(vatPercent);
      await apiPatch(`/api/v1/clinics/${clinicId}`, {
        licenseNumber: license.trim(),
        // only send the tax number when it changed: a markets that requires a TRN must not block saving the licence alone
        ...(taxReg.trim() !== (detail.taxRegistrationNumber ?? "") ? { taxRegistrationNumber: taxReg.trim() || null } : {}),
      });
      await invoiceMut.mutateAsync(
        vatOverride
          ? { invoiceVatPercent: Number.isFinite(vatN) ? vatN : 0 }
          : { invoiceVatPercentUseMarketDefault: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(t("clinics.regulatorySettingsSaved", "License and tax registration saved."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const dirty =
    license.trim() !== detail.licenseNumber.trim() ||
    (taxReg.trim() || "") !== (detail.taxRegistrationNumber ?? "").trim() ||
    vatOverride !== !detail.invoiceVatPercentUsesMarketDefault ||
    String(detail.invoiceVatPercent ?? 0) !== vatPercent.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("clinics.regulatorySettingsTitle", "License & tax authority")}
        </CardTitle>
        <CardDescription>
          {authorityName
            ? t(
                "clinics.regulatorySettingsHintWithAuthority",
                "Numbers from {{authority}} printed on invoices, payment records, and accountant exports.",
                { authority: authorityName },
              )
            : t(
                "clinics.regulatorySettingsHint",
                "Printed on invoices, payment records, and accountant exports for this branch.",
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinic-reg-license">{licenseLabel}</Label>
          <Input
            id="clinic-reg-license"
            data-setup-target="clinic_profile"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            disabled={!canEdit}
            className="max-w-md"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinic-reg-tax">{taxLabel}</Label>
          <Input
            id="clinic-reg-tax"
            className="max-w-md ltr-nums"
            value={taxReg}
            onChange={(e) => setTaxReg(e.target.value)}
            disabled={!canEdit}
            placeholder={t("clinics.trnPlaceholder", "Organization or market default")}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "clinics.regulatoryOrgDefaultHint",
              "Group admins can push organization defaults under Administration → Organization & settings.",
            )}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="clinic-reg-vat">{t("invoices.vatPercentSetting", "VAT % on invoices")}</Label>
          <Input
            id="clinic-reg-vat"
            className="max-w-xs ltr-nums"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={vatPercent}
            disabled={!canEdit || !vatOverride}
            onChange={(e) => setVatPercent(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={vatOverride}
              disabled={!canEdit}
              onChange={(e) => setVatOverride(e.target.checked)}
            />
            {t("admin.orgOverrideMarketDefault", "Override market default")}
          </label>
        </div>
        {canEdit ? (
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={!dirty || saveMut.isPending || invoiceMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {t("common.save", "Save")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}