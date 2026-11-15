import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { PrismaService } from "../prisma/prisma.service";
import {
  parseMarketPaymentMethods,
  transferChannelsFromMarketMethods,
  type MarketPaymentMethodDef,
} from "./market-payment-methods";
import { resolveMarketForTenant } from "./market-resolver";

export type TenantTransferCollectionContext = {
  paymentMethods: MarketPaymentMethodDef[];
  allowedTransferChannels: Set<string>;
};

export async function resolveTenantTransferCollectionContext(
  prisma: PrismaService,
  featureFlags: FeatureFlagsService,
  tenantId: string,
): Promise<TenantTransferCollectionContext> {
  const marketCtx = await resolveMarketForTenant(prisma, tenantId);
  const paymentMethods = parseMarketPaymentMethods(marketCtx.paymentMethods);
  const channels = transferChannelsFromMarketMethods(paymentMethods);
  const allowedTransferChannels = new Set<string>();
  for (const ch of channels) {
    if (ch === "INSTAPAY" && !(await featureFlags.isEnabled(tenantId, "instapay"))) continue;
    if (ch === "FAWRY" && !(await featureFlags.isEnabled(tenantId, "fawry"))) continue;
    allowedTransferChannels.add(ch);
  }
  return { paymentMethods, allowedTransferChannels };
}