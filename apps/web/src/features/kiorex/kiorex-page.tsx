import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet } from "@/lib/http";
import { KiorexBookingLinkCard } from "./kiorex-booking-link-card";
import { KiorexBookingSettingsCard } from "./kiorex-booking-settings-card";
import { KiorexPerformanceCard } from "./kiorex-performance-card";
import { KiorexPolicyCard } from "./kiorex-policy-card";
import { KiorexRatingsCard } from "./kiorex-ratings-card";
import type { KiorexSettingsDto } from "./kiorex-types";

export function KiorexPage() {
  const { t, i18n } = useTranslation();
  const clinics = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");

  useEffect(() => {
    if (!clinicId && clinics.data?.length) setClinicId(clinics.data[0]!.id);
  }, [clinicId, clinics.data]);

  const settings = useQuery({
    queryKey: ["kiorex", "settings", clinicId],
    queryFn: () => apiGet<KiorexSettingsDto>(`/api/v1/kiorex/settings?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("kiorexTab.title", "Kiorex")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("kiorexTab.subtitle", "Control how patients find and book you on Kiorex, and see what it brings in.")}
          </p>
        </div>
        {clinics.data && clinics.data.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="kiorex-clinic">{t("kiorexTab.clinic", "Branch")}</Label>
            <select
              id="kiorex-clinic"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              {clinics.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {i18n.language.startsWith("ar") ? c.nameAr || c.nameEn : c.nameEn}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {settings.isError ? (
        <p className="text-sm text-destructive">
          {t("kiorexTab.loadError", "Kiorex settings are available to clinic owners and managers.")}
        </p>
      ) : null}
      {settings.data ? (
        <>
          <KiorexPerformanceCard clinicId={clinicId} />
          <KiorexBookingSettingsCard clinicId={clinicId} settings={settings.data} />
          <KiorexBookingLinkCard clinicId={clinicId} />
          <KiorexRatingsCard clinicId={clinicId} />
          <KiorexPolicyCard clinicId={clinicId} settings={settings.data} />
        </>
      ) : null}
    </div>
  );
}
