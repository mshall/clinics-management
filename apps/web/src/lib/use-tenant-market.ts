import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { TransferReferenceRule } from "@/lib/visit-collection";

export type OrganizationPaymentChannel = {
  id: string;
  name: string;
  channelKey: string;
  accountNumber: string | null;
  mobileNumber: string | null;
  referencePattern: string;
  fiscalPaymentCode: string;
};

export type TenantMarketContext = {
  marketId: string;
  marketCode: string;
  currency: string;
  timezone: string;
  weekendDays: number[];
  paymentMethods: Array<{ key: string; labelKey?: string; transferChannel?: string; referencePattern?: string }>;
  organizationPaymentChannels: OrganizationPaymentChannel[];
  transferChannels: string[];
};

export function useTenantMarket() {
  return useQuery({
    queryKey: ["markets", "current"],
    queryFn: () => apiGet<TenantMarketContext>("/api/v1/markets/current"),
    staleTime: 60_000,
  });
}
/** Reference regexes for every transfer channel the desk can pick (market methods + org channels). */
export function transferRulesFromMarket(ctx: TenantMarketContext | undefined): TransferReferenceRule[] {
  if (!ctx) return [];
  return [
    ...ctx.paymentMethods.map((m) => ({ transferChannel: m.transferChannel, referencePattern: m.referencePattern })),
    ...ctx.organizationPaymentChannels.map((c) => ({ channelKey: c.channelKey, referencePattern: c.referencePattern })),
  ];
}
