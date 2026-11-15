import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [taxReg, setTaxReg] = useState(detail.taxRegistrationNumber ?? "N/A");
  const [vatPercent, setVatPercent] = useState(String(detail.invoiceVatPercent ?? 5));

  useEffect(() => {
    setLicense(detail.licenseNumber);
    setTaxReg(detail.taxRegistrationNumber ?? "N/A");
    setVatPercent(String(detail.invoiceVatPercent ?? 5));
  }, [detail.licenseNumber, detail.taxRegistrationNumber, detail.invoiceVatPercent]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const vatN = Number.parseFloat(vatPercent);
      await apiPatch(`/api/v1/clinics/${clinicId}`, {
        licenseNumber: license.trim(),
        taxRegistrationNumber: taxReg.trim() || "N/A",
      });
      await invoiceMut.mutateAsync({
        invoiceVatPercent: Number.isFinite(vatN) ? vatN : 5,
      });
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
    (taxReg.trim() || "N/A") !== (detail.taxRegistrationNumber ?? "N/A").trim() ||
    String(detail.invoiceVatPercent ?? 5) !== vatPercent.trim();

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
                "Numbers from {{authority}} used on tax invoices, fiscal receipts, and compliance exports.",
                { authority: authorityName },
              )
            : t(
                "clinics.regulatorySettingsHint",
                "Used on tax invoices, fiscal receipts, and compliance exports for this branch.",
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinic-reg-license">{licenseLabel}</Label>
          <Input
            id="clinic-reg-license"
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
            placeholder="N/A"
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
            onChange={(e) => setVatPercent(e.target.value)}
            disabled={!canEdit}
          />
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