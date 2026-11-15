import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useClinicsQuery } from "@/lib/api-hooks";

/** Legacy route — templates live under Clinics → Settings. */
export function ClinicalTemplatesRedirect() {
  const { t } = useTranslation();
  const { data: clinics = [], isPending } = useClinicsQuery();

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const first = clinics.find((c) => c.recordStatus === "ACTIVE") ?? clinics[0];
  if (!first) {
    return <Navigate to="/clinics" replace />;
  }

  return <Navigate to={`/clinics/${first.id}?tab=settings`} replace />;
}