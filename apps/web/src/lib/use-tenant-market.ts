import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export type FiscalDeviceRegistration = {
  required: boolean;
  credentialFields: Array<{ key: string; type: string; labelKey: string }>;
  registrationGuideKey: string;
};

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
  fiscalProviderKey: string;
  fiscalDeviceRegistration: FiscalDeviceRegistration | null;
  paymentMethods: Array<{ key: string; labelKey?: string; transferChannel?: string }>;
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