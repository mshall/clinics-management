import { BadRequestException, Injectable } from "@nestjs/common";
import type { MoneyTransferChannel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAG_KEYS,
  isKnownFeatureFlagKey,
  type FeatureFlagKey,
} from "./feature-flag-keys";

export type FeatureFlagLayerView = {
  key: FeatureFlagKey;
  description: string;
  globalEnabled: boolean;
  marketEnabled: boolean | null;
  tenantEnabled: boolean | null;
  effective: boolean;
};

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(tenantId: string, key: FeatureFlagKey | string): Promise<boolean> {
    const row = await this.resolveRow(tenantId, key);
    return row?.effective ?? false;
  }

  async listForTenant(tenantId: string): Promise<FeatureFlagLayerView[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        market: { include: { featureFlags: true } },
        tenantFeatureFlags: true,
      },
    });
    if (!tenant) return [];

    const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...FEATURE_FLAG_KEYS] } } });
    const globalByKey = new Map(globals.map((g) => [g.key, g.enabled]));

    return FEATURE_FLAG_KEYS.map((key) => {
      const description = FEATURE_FLAG_DESCRIPTIONS[key];
      const globalEnabled = globalByKey.get(key) ?? true;
      const marketFlag = tenant.market?.featureFlags.find((f) => f.key === key);
      const marketEnabled = marketFlag ? marketFlag.enabled : this.marketDefaultFromJson(tenant.market?.featureDefaults, key);
      const tenantFlag = tenant.tenantFeatureFlags.find((f) => f.key === key);
      let tenantEnabled: boolean | null = tenantFlag ? tenantFlag.enabled : null;
      if (key === "whatsapp_reminders" && tenantFlag == null) {
        tenantEnabled = tenant.whatsAppRemindersEnabled;
      }
      const effective = this.computeEffective(globalEnabled, marketEnabled, tenantEnabled);
      return {
        key,
        description,
        globalEnabled,
        marketEnabled,
        tenantEnabled,
        effective,
      };
    });
  }

  async listForMarket(marketId: string): Promise<FeatureFlagLayerView[]> {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: { featureFlags: true },
    });
    if (!market) return [];

    const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...FEATURE_FLAG_KEYS] } } });
    const globalByKey = new Map(globals.map((g) => [g.key, g.enabled]));

    return FEATURE_FLAG_KEYS.map((key) => {
      const marketFlag = market.featureFlags.find((f) => f.key === key);
      const marketEnabled = marketFlag ? marketFlag.enabled : this.marketDefaultFromJson(market.featureDefaults, key);
      const globalEnabled = globalByKey.get(key) ?? true;
      const effective = this.computeEffective(globalEnabled, marketEnabled, null);
      return {
        key,
        description: FEATURE_FLAG_DESCRIPTIONS[key],
        globalEnabled,
        marketEnabled,
        tenantEnabled: null,
        effective,
      };
    });
  }

  async setTenantFlag(tenantId: string, key: string, enabled: boolean) {
    if (!isKnownFeatureFlagKey(key)) throw new BadRequestException("Unknown feature flag key");
    const row = await this.prisma.tenantFeatureFlag.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, enabled, description: FEATURE_FLAG_DESCRIPTIONS[key] },
      update: { enabled },
    });
    if (key === "whatsapp_reminders") {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { whatsAppRemindersEnabled: enabled },
      });
    }
    return row;
  }

  async setMarketFlag(marketId: string, key: string, enabled: boolean) {
    if (!isKnownFeatureFlagKey(key)) throw new BadRequestException("Unknown feature flag key");
    return this.prisma.marketFeatureFlag.upsert({
      where: { marketId_key: { marketId, key } },
      create: { marketId, key, enabled, description: FEATURE_FLAG_DESCRIPTIONS[key] },
      update: { enabled },
    });
  }

  async allowedTransferChannels(tenantId: string): Promise<Set<MoneyTransferChannel>> {
    const out = new Set<MoneyTransferChannel>();
    if (await this.isEnabled(tenantId, "instapay")) out.add("INSTAPAY");
    if (await this.isEnabled(tenantId, "fawry")) out.add("FAWRY");
    return out;
  }

  private async resolveRow(tenantId: string, key: string): Promise<FeatureFlagLayerView | null> {
    const list = await this.listForTenant(tenantId);
    return list.find((r) => r.key === key) ?? null;
  }

  private computeEffective(
    globalEnabled: boolean,
    marketEnabled: boolean | null,
    tenantEnabled: boolean | null,
  ): boolean {
    if (!globalEnabled) return false;
    if (marketEnabled === false) return false;
    if (tenantEnabled === false) return false;
    if (tenantEnabled === true) return true;
    if (marketEnabled === true) return true;
    if (marketEnabled === null) return true;
    return false;
  }

  private marketDefaultFromJson(featureDefaults: unknown, key: FeatureFlagKey): boolean | null {
    if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) return null;
    const m = featureDefaults as Record<string, unknown>;
    const legacy: Record<FeatureFlagKey, string> = {
      eta_receipts: "etaReceipts",
      whatsapp_reminders: "whatsAppReminders",
      instapay: "instapay",
      fawry: "fawry",
      card_payments: "cardPayments",
    };
    const v = m[legacy[key]];
    return typeof v === "boolean" ? v : null;
  }
}