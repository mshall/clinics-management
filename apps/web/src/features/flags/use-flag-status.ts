import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export function useFlagStatus() {
  return useQuery({
    queryKey: ["platform", "feature-flags-status"],
    queryFn: () => apiGet<FlagStatus>("/api/v1/admin/platform/feature-flags-status"),
  });
}

export type FlagStatus = {
  managed: boolean;
  snapshot: { ageSeconds: number | null; stale: boolean; version: number | null } | null;
};
