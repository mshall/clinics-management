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
  return useMemo(() => truthy(entitlements?.[key]), [entitlements, key]);
}

export function usePlanKey(): string | null {
  return useAuthStore((s) => s.user?.plan?.key ?? null);
}