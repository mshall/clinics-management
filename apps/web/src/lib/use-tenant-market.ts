import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export type TenantMarketContext = {
  marketId: string;
  marketCode: string;
  currency: string;
  timezone: string;
  weekendDays: number[];
  fiscalProviderKey: string;
  paymentMethods: Array<{ key: string; labelKey?: string; transferChannel?: string }>;
  transferChannels: string[];
};

export function useTenantMarket() {
  return useQuery({
    queryKey: ["markets", "current"],
    queryFn: () => apiGet<TenantMarketContext>("/api/v1/markets/current"),
    staleTime: 60_000,
  });
}