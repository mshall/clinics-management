import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClinicDetailDto } from "@/lib/api-types";
import {
  DEFAULT_INVOICE_SECTIONS,
  INVOICE_BACKGROUND_COLORS,
  INVOICE_SECTION_KEYS,
  INVOICE_SECTION_LABELS,
} from "@/lib/invoice-config";
import {
  clinicInvoiceLogoUrl,
  usePatchClinicInvoiceSettingsMutation,
  useUploadClinicInvoiceLogoMutation,
} from "@/lib/invoice-hooks";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";
import { cn } from "@/lib/utils";

type ClinicInvoiceSettingsPanelProps = {
  clinicId: string;
  detail: ClinicDetailDto;
  disabled?: boolean;
};

export function ClinicInvoiceSettingsPanel({ clinicId, detail, disabled }: ClinicInvoiceSettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const patchMut = usePatchClinicInvoiceSettingsMutation(clinicId);
  const uploadMut = useUploadClinicInvoiceLogoMutation(clinicId);
  const [backgroundColor, setBackgroundColor] = useState(detail.invoiceBackgroundColor || "white");
  const [sections, setSections] = useState<string[]>(detail.invoiceSections ?? DEFAULT_INVOICE_SECTIONS);
  const [logoKey, setLogoKey] = useState(0);
  const logo = useAuthenticatedImage(
    detail.hasInvoiceLogo ? `${clinicInvoiceLogoUrl(clinicId)}?v=${logoKey}` : null,
    detail.hasInvoiceLogo,
  );

  useEffect(() => {
    setBackgroundColor(detail.invoiceBackgroundColor || "white");
    setSections(detail.invoiceSections ?? DEFAULT_INVOICE_SECTIONS);
  }, [detail.invoiceBackgroundColor, detail.invoiceSections, clinicId]);

  const toggleSection = (key: string) => {
    setSections((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((s) => s !== key);
        return next.length ? next : prev;
      }
      return [...prev, key];
    });
  };

  const saveSettings = async () => {
    try {
      await patchMut.mutateAsync({ invoiceBackgroundColor: backgroundColor, invoiceSections: sections });
      toast.success(t("invoices.settingsSaved", "Invoice settings saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onLogoPick = async (file: File | null) => {
    if (!file) return;
    try {
      await uploadMut.mutateAsync(file);
      setLogoKey((k) => k + 1);
      toast.success(t("invoices.logoUploaded", "Invoice logo uploaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const lang = i18n.language === "ar" ? "ar" : "en";

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("invoices.settingsTitle", "Clinic invoicing")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("invoices.settingsHint", "Configure logo, background, and sections for patient invoices.")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("invoices.logo", "Invoice logo")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          {detail.hasInvoiceLogo && logo.url ? (
            <img
              src={logo.url}
              alt=""
              className="h-14 max-w-[160px] rounded border bg-white object-contain p-1"
            />
          ) : detail.hasInvoiceLogo && logo.loading ? (
            <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("invoices.noLogo", "No logo uploaded")}</span>
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

      <div className="space-y-2">
        <Label>{t("invoices.backgroundColor", "Invoice background color")}</Label>
        <div className="flex flex-wrap gap-2">
          {INVOICE_BACKGROUND_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              title={c.label}
              className={cn(
                "h-9 w-9 rounded-md border-2 transition-transform hover:scale-105",
                backgroundColor === c.id ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
              style={{ backgroundColor: c.hex }}
              onClick={() => setBackgroundColor(c.id)}
              aria-label={c.label}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("invoices.sections", "Invoice sections")}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {INVOICE_SECTION_KEYS.map((key) => {
            const labels = INVOICE_SECTION_LABELS[key];
            return (
              <label key={key} className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={sections.includes(key)}
                  disabled={disabled}
                  onChange={() => toggleSection(key)}
                />
                <span>{labels ? labels[lang] : key}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Button type="button" size="sm" disabled={disabled || patchMut.isPending} onClick={() => void saveSettings()}>
        {t("invoices.saveSettings", "Save invoice settings")}
      </Button>
    </div>
  );
}
