import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicDetailDto } from "@/lib/api-types";
import { clinicPrescriptionLogoUrl, usePatchClinicPrescriptionSettingsMutation, useUploadClinicPrescriptionLogoMutation } from "@/lib/prescription-hooks";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";

type ClinicPrescriptionSettingsPanelProps = {
  clinicId: string;
  detail: ClinicDetailDto;
  disabled?: boolean;
};

export function ClinicPrescriptionSettingsPanel({
  clinicId,
  detail,
  disabled,
}: ClinicPrescriptionSettingsPanelProps) {
  const { t } = useTranslation();
  const patchMut = usePatchClinicPrescriptionSettingsMutation(clinicId);
  const uploadMut = useUploadClinicPrescriptionLogoMutation(clinicId);
  const [descriptionEn, setDescriptionEn] = useState(detail.prescriptionHeaderDescriptionEn ?? "");
  const [descriptionAr, setDescriptionAr] = useState(detail.prescriptionHeaderDescriptionAr ?? "");
  const [logoKey, setLogoKey] = useState(0);
  const logo = useAuthenticatedImage(
    detail.hasPrescriptionLogo ? `${clinicPrescriptionLogoUrl(clinicId)}?v=${logoKey}` : null,
    detail.hasPrescriptionLogo,
  );

  useEffect(() => {
    setDescriptionEn(detail.prescriptionHeaderDescriptionEn ?? "");
    setDescriptionAr(detail.prescriptionHeaderDescriptionAr ?? "");
  }, [detail.prescriptionHeaderDescriptionEn, detail.prescriptionHeaderDescriptionAr, clinicId]);

  const saveSettings = async () => {
    try {
      await patchMut.mutateAsync({
        prescriptionHeaderDescriptionEn: descriptionEn,
        prescriptionHeaderDescriptionAr: descriptionAr,
      });
      toast.success(t("prescriptions.settingsSaved", "Prescription settings saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onLogoPick = async (file: File | null) => {
    if (!file) return;
    try {
      await uploadMut.mutateAsync(file);
      setLogoKey((k) => k + 1);
      toast.success(t("prescriptions.logoUploaded", "Prescription logo uploaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("prescriptions.settingsTitle", "Generated prescription header")}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "prescriptions.settingsHint",
            "Optional logo and description for the prescription header. If left empty, the default template is used.",
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("prescriptions.logo", "Header logo")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          {detail.hasPrescriptionLogo && logo.url ? (
            <img src={logo.url} alt="" className="h-14 max-w-[160px] rounded border bg-white object-contain p-1" />
          ) : detail.hasPrescriptionLogo && logo.loading ? (
            <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("prescriptions.noLogo", "No logo uploaded")}</span>
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="max-w-xs"
            disabled={disabled || uploadMut.isPending}
            onChange={(e) => void onLogoPick(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`rx-desc-en-${clinicId}`}>{t("prescriptions.descriptionEn", "Header description (English)")}</Label>
          <Textarea
            id={`rx-desc-en-${clinicId}`}
            rows={3}
            value={descriptionEn}
            disabled={disabled}
            onChange={(e) => setDescriptionEn(e.target.value)}
            placeholder={t("prescriptions.descriptionPlaceholder", "Clinic address, phone, license…")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`rx-desc-ar-${clinicId}`}>{t("prescriptions.descriptionAr", "Header description (Arabic)")}</Label>
          <Textarea
            id={`rx-desc-ar-${clinicId}`}
            rows={3}
            dir="rtl"
            value={descriptionAr}
            disabled={disabled}
            onChange={(e) => setDescriptionAr(e.target.value)}
            placeholder={t("prescriptions.descriptionPlaceholderAr", "العنوان، الهاتف، الترخيص…")}
          />
        </div>
      </div>

      <Button type="button" size="sm" disabled={disabled || patchMut.isPending} onClick={() => void saveSettings()}>
        {t("prescriptions.saveSettings", "Save prescription settings")}
      </Button>
    </div>
  );
}
