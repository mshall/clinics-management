import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export type EffectiveFlag = {
  key: string;
  effective: boolean;
  source: string;
  awaitingGate: boolean;
  class: string;
  scopes: string[];
  dependsOn: string[];
  description: string;
  descriptionAr: string;
};

export type EffectiveFlagsResponse = {
  managed: boolean;
  snapshot: { ageSeconds: number | null; stale: boolean; version: number | null } | null;
  flags: EffectiveFlag[];
};

/** FF04 — effective flags for the signed-in organization (server enforces; the UI only hides entry points). */
export function useEffectiveFlags() {
  return useQuery({
    queryKey: ["feature-flags", "effective"],
    queryFn: () => apiGet<EffectiveFlagsResponse>("/api/v1/feature-flags/effective"),
    staleTime: 30_000,
  });
}

/** Unknown flags and a not-yet-loaded list count as ON: the API returns 403 FEATURE_DISABLED regardless. */
export function isFlagOn(data: EffectiveFlagsResponse | undefined, key: string): boolean {
  const f = data?.flags.find((x) => x.key === key);
  return f ? f.effective : true;
}
