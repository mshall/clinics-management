import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import {
  parseMarketPaymentMethods,
  transferChannelsFromMarketMethods,
  type MarketPaymentMethodDef,
} from "../markets/market-payment-methods";
import { resolveMarketForTenant } from "../markets/market-resolver";
import {
  mapOrganizationPaymentChannel,
  organizationChannelsToPaymentMethods,
  type OrganizationPaymentChannelDto,
} from "../markets/tenant-payment-channel-merge";

export type TenantTransferCollectionContext = {
  paymentMethods: MarketPaymentMethodDef[];
  allowedTransferChannels: Set<string>;
  organizationPaymentChannels: OrganizationPaymentChannelDto[];
};

export async function resolveTenantTransferCollectionContext(
  prisma: PrismaService,
  featureFlags: FeatureFlagsService,
  tenantId: string,
): Promise<TenantTransferCollectionContext> {
  const marketCtx = await resolveMarketForTenant(prisma, tenantId);
  const marketMethods = parseMarketPaymentMethods(marketCtx.paymentMethods);
  const orgRows = await prisma.tenantPaymentChannel.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
  const organizationPaymentChannels = orgRows.map(mapOrganizationPaymentChannel);
  const orgMethods = organizationChannelsToPaymentMethods(orgRows);
  const paymentMethods = [...marketMethods, ...orgMethods];
  const channels = transferChannelsFromMarketMethods(paymentMethods);
  const allowedTransferChannels = new Set<string>();
  for (const ch of channels) {
    if (ch === "INSTAPAY" && !(await featureFlags.isEnabled(tenantId, "instapay"))) continue;
    if (ch === "FAWRY" && !(await featureFlags.isEnabled(tenantId, "fawry"))) continue;
    allowedTransferChannels.add(ch);
  }
  for (const org of orgRows) {
    allowedTransferChannels.add(org.channelKey.toUpperCase());
  }
  return { paymentMethods, allowedTransferChannels, organizationPaymentChannels };
}