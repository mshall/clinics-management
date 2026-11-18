import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AdminOverviewDto } from "@/lib/api-types";

type EtaTenantFields = {
  etaPlatformIntegrationEnabled?: boolean;
  etaPhysicalReportingOptOut?: boolean;
};

/** Platform + org ETA integration state for Egypt e-receipt UI and banners. */
export function useOrgEtaIntegration(enabled = true) {
  const q = useQuery({
    queryKey: ["admin", "overview", "eta-opt-out"],
    queryFn: () => apiGet<AdminOverviewDto>("/api/v1/admin/overview"),
    enabled,
    staleTime: 60_000,
  });
  const tenant = q.data?.currentTenant as EtaTenantFields | null | undefined;
  const optOut = tenant?.etaPhysicalReportingOptOut === true;
  return {
    platformEnabled: false,
    optOut,
    /** FD-02: clinics issue their own ETA documents; hide product ETA UI. */
    showEtaUi: false,
    issuingActive: false,
    isLoading: q.isLoading,
  };
}