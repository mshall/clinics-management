import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export function useKiorexConfig() {
  return useQuery({
    queryKey: ["auth", "kiorex", "config"],
    queryFn: () => apiGet<{ enabled: boolean; edition?: "CLINIC" | "NURSE"; defaultSignIn?: "KIOREX_PASSPORT" | "PASSWORD" }>("/api/v1/auth/kiorex/config"),
    staleTime: 60_000,
    retry: false,
  });
}
