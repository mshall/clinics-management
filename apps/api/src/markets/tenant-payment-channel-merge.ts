import type { TenantPaymentChannel } from "@prisma/client";
import type { MarketPaymentMethodDef } from "./market-payment-methods";

export type OrganizationPaymentChannelDto = {
  id: string;
  name: string;
  channelKey: string;
  accountNumber: string | null;
  mobileNumber: string | null;
  referencePattern: string;
  fiscalPaymentCode: string;
};

export function mapOrganizationPaymentChannel(row: TenantPaymentChannel): OrganizationPaymentChannelDto {
  return {
    id: row.id,
    name: row.name,
    channelKey: row.channelKey,
    accountNumber: row.accountNumber,
    mobileNumber: row.mobileNumber,
    referencePattern: row.referencePattern,
    fiscalPaymentCode: row.fiscalPaymentCode,
  };
}

export function organizationChannelsToPaymentMethods(channels: TenantPaymentChannel[]): MarketPaymentMethodDef[] {
  return channels.map((c) => ({
    key: c.channelKey,
    transferChannel: c.channelKey,
    referencePattern: c.referencePattern,
    fiscalPaymentCode: c.fiscalPaymentCode,
  }));
}