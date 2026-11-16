import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useOrgEtaPhysicalOptOut } from "@/lib/use-org-eta-opt-out";
import { useClinicEtaReceiptsEnabled } from "@/lib/use-clinic-eta-receipts-enabled";

/** Shown on billing/revenue flows so staff know Kiorly is not issuing ETA receipts. */
export function EtaIntegrationBanner({ clinicId }: { clinicId?: string } = {}) {
  const { t } = useTranslation();
  const { optOut, isLoading: orgLoading } = useOrgEtaPhysicalOptOut();
  const clinicReceiptsOn = useClinicEtaReceiptsEnabled(clinicId);
  if (orgLoading) return null;
  if (!optOut && clinicReceiptsOn) return null;

  return (
    <div
      className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {optOut
          ? t("compliance.etaIntegrationDisabledBanner")
          : t("compliance.etaClinicReceiptsDisabledBanner")}
      </p>
    </div>
  );
}