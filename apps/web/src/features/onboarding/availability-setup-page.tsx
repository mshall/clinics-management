import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { AvailabilityEditor } from "@/features/nurse/availability-zones";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

type ClinicRow = { id: string; nameEn: string; nameAr: string };

/** Quick setup: the signed-in clinician's weekly availability at one clinic (the clinic id comes from the deep link). */
export function AvailabilitySetupPage() {
  const { t, i18n } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  const clinics = useQuery({ queryKey: ["clinics", "setup-availability"], queryFn: () => apiGet<ClinicRow[]>("/api/v1/clinics") });
  const clinicId = params.get("entity") ?? clinics.data?.[0]?.id;
  const clinic = clinics.data?.find((c) => c.id === clinicId);
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  if (!me) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="availability-setup-page">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.availability.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {clinic ? t("onboarding.availability.at", { clinic: lang === "ar" ? clinic.nameAr || clinic.nameEn : clinic.nameEn }) : t("onboarding.availability.hint")}
        </p>
      </header>
      {clinicId ? <AvailabilityEditor clinicianId={me.id} clinicId={clinicId} title={t("onboarding.availability.card")} /> : null}
    </div>
  );
}
