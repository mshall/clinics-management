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
  const platformEnabled = tenant?.etaPlatformIntegrationEnabled === true;
  const optOut = tenant?.etaPhysicalReportingOptOut === true;
  return {
    platformEnabled,
    optOut,
    /** Show ETA settings, devices, credentials, and health UI. */
    showEtaUi: platformEnabled,
    /** Kiorly queues/submits e-receipts. */
    issuingActive: platformEnabled && !optOut,
    isLoading: q.isLoading,
  };
}