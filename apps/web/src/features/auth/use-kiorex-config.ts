import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { currentOrgHint } from "@/lib/sign-in-default";

type KiorexConfig = { enabled: boolean; edition?: "CLINIC" | "NURSE"; defaultSignIn?: "KIOREX_PASSPORT" | "PASSWORD"; passportAvailable?: boolean; defaultMethod?: "PASSWORD" | "PASSPORT" };

/** `GET /auth/kiorex/config`: Passport availability plus the preselected method for the organisation identified before login (`?org=`, remembered org) or the deployment/edition default. */
export function useKiorexConfig() {
  const org = currentOrgHint();
  return useQuery({
    queryKey: ["auth", "kiorex", "config", org],
    queryFn: () => apiGet<KiorexConfig>(`/api/v1/auth/kiorex/config${org ? `?org=${encodeURIComponent(org)}` : ""}`),
    staleTime: 60_000,
    retry: false,
  });
}
