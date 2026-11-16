import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AdminOverviewDto } from "@/lib/api-types";

/** True when the org disabled Kiorly ETA e-receipt integration (group admin setting). */
export function useOrgEtaPhysicalOptOut(enabled = true) {
  const q = useQuery({
    queryKey: ["admin", "overview", "eta-opt-out"],
    queryFn: () => apiGet<AdminOverviewDto>("/api/v1/admin/overview"),
    enabled,
    staleTime: 60_000,
  });
  const tenant = q.data?.currentTenant as { etaPhysicalReportingOptOut?: boolean } | null | undefined;
  return {
    optOut: tenant?.etaPhysicalReportingOptOut === true,
    isLoading: q.isLoading,
  };
}