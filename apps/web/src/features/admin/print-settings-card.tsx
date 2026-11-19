import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useClinicsQuery } from "@/lib/api-hooks";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPut } from "@/lib/http";
import { formatClinicNameFields } from "@/lib/locale-display";

type PrintSettings = {
  clinicId: string;
  thermalPrinterProfileId: string;
  profiles: { id: string; nameEn: string; nameAr: string; paperWidthMm: number }[];
};

/** UX-04 — thermal printer profile (80 mm Epson / Star). */
export function PrintSettingsCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  const active = clinicId || clinics[0]?.id || "";

  const settings = useQuery({
    queryKey: ["print-settings", active],
    queryFn: () => apiGet<PrintSettings>(`/api/v1/front-desk/print-settings?clinicId=${encodeURIComponent(active)}`),
    enabled: Boolean(active),
    retry: false,
  });

  const [profileId, setProfileId] = useState("");
  const selected = profileId || settings.data?.thermalPrinterProfileId || "";

  const save = useMutation({
    mutationFn: () =>
      apiPut("/api/v1/front-desk/print-settings", {
        clinicId: active,
        thermalPrinterProfileId: selected,
      }),
    onSuccess: () => {
      toast.success(t("printSettings.saved"));
      void qc.invalidateQueries({ queryKey: ["print-settings"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const previewTicket = () => {
    if (!active) return;
    window.open(
      `/api/v1/front-desk/print/queue-ticket?clinicId=${encodeURIComponent(active)}&ticketNumber=1&locale=${i18n.language.startsWith("ar") ? "ar" : "en"}`,
      "_blank",
    );
  };

  return (
    <Card data-testid="print-settings-card">
      <CardHeader>
        <CardTitle>{t("printSettings.title")}</CardTitle>
        <CardDescription>{t("printSettings.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem]">
          <Label htmlFor="print-clinic">{t("printSettings.clinic")}</Label>
          <select
            id="print-clinic"
            className={nativeSelectClassName}
            value={active}
            onChange={(e) => {
              setClinicId(e.target.value);
              setProfileId("");
            }}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {formatClinicNameFields(c.nameEn, c.nameAr, i18n.language, c.id)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="print-profile">{t("printSettings.profile")}</Label>
          <select
            id="print-profile"
            className={nativeSelectClassName}
            value={selected}
            onChange={(e) => setProfileId(e.target.value)}
            data-testid="thermal-profile-select"
          >
            {(settings.data?.profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {i18n.language.startsWith("ar") ? p.nameAr : p.nameEn} ({p.paperWidthMm} mm)
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => save.mutate()} disabled={!selected || save.isPending}>
          {t("printSettings.save")}
        </Button>
        <Button type="button" variant="outline" onClick={previewTicket}>
          {t("printSettings.previewTicket")}
        </Button>
      </CardContent>
    </Card>
  );
}
