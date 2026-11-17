import { useOrgEtaIntegration } from "@/lib/use-org-eta-integration";

/** @deprecated Prefer useOrgEtaIntegration */
export function useOrgEtaPhysicalOptOut(enabled = true) {
  const { optOut, platformEnabled, isLoading } = useOrgEtaIntegration(enabled);
  return {
    optOut: !platformEnabled || optOut,
    isLoading,
  };
}