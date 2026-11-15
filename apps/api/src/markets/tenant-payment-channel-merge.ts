import type { TenantPaymentChannel } from "@prisma/client";
import type { MarketPaymentMethodDef } from "./market-payment-methods";

export type OrganizationPaymentChannelDto = {
  id: string;
  name: string;
  channelKey: string;
  accountNumber: string | null;
  mobileNumber: string | null;
};

export function mapOrganizationPaymentChannel(row: TenantPaymentChannel): OrganizationPaymentChannelDto {
  return {
    id: row.id,
    name: row.name,
    channelKey: row.channelKey,
    accountNumber: row.accountNumber,
    mobileNumber: row.mobileNumber,
  };
}

export function organizationChannelsToPaymentMethods(channels: TenantPaymentChannel[]): MarketPaymentMethodDef[] {
  return channels.map((c) => ({
    key: c.channelKey,
    transferChannel: c.channelKey,
  }));
}