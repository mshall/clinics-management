import { ImagePlus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clinicInvoiceLogoUrl, useUploadClinicInvoiceLogoMutation } from "@/lib/invoice-hooks";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";

/** Clinic logo (printed on invoices and prescriptions). Quick setup "Upload clinic logo" lands here. */
export function ClinicLogoCard({ clinicId, hasLogo, canEdit }: { clinicId: string; hasLogo: boolean; canEdit: boolean }) {
  const { t } = useTranslation();
  const upload = useUploadClinicInvoiceLogoMutation(clinicId);
  const input = useRef<HTMLInputElement>(null);
  const img = useAuthenticatedImage(hasLogo ? clinicInvoiceLogoUrl(clinicId) : null, hasLogo);
  const pick = async (file: File | null) => {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success(t("invoices.logoUploaded", "Invoice logo uploaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card data-testid="clinic-logo-card">
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.logoTitle", "Clinic logo")}</CardTitle>
        <CardDescription>{t("clinics.logoHint", "Shown on invoices and prescriptions. PNG or JPG, square works best.")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {img.url ? <img src={img.url} alt="" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden />}
        </div>
        {canEdit ? (
          <>
            <input ref={input} id="clinic-logo-file" data-testid="clinic-logo-input" data-setup-target="clinic_logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
              {hasLogo ? t("clinics.logoReplace", "Replace logo") : t("clinics.logoUpload", "Upload logo")}
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
