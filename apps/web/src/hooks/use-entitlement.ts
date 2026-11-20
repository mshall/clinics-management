import { useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value && typeof value === "object") return true;
  return false;
}

export function useEntitlement(key: string): boolean {
  const entitlements = useAuthStore((s) => s.user?.entitlements);
  const platformSuperAdmin = useAuthStore((s) => s.user?.platformSuperAdmin);
  return useMemo(() => {
    // Platform operators are not on a clinic plan — do not show paywalls for them.
    if (platformSuperAdmin) return true;
    return truthy(entitlements?.[key]);
  }, [entitlements, key, platformSuperAdmin]);
}

export function usePlanKey(): string | null {
  return useAuthStore((s) => s.user?.plan?.key ?? null);
}