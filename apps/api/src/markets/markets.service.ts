import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MarketLaunchStatus, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { defaultCurrencyForCountry } from "../common/country-default-currency";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";

export type CreateMarketDto = {
  code: string;
  nameEn: string;
  nameAr?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
  dataRegion?: string;
  hostCell?: string;
  defaultPhoneRegion?: string;
  taxConfig?: Record<string, unknown>;
  paymentMethods?: unknown[];
};

@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new BadRequestException("Platform super admin only");
  }

  async list(user: JwtUser) {
    this.assertPlatform(user);
    const rows = await this.prisma.market.findMany({ orderBy: { code: "asc" } });
    return rows.map((m) => this.mapMarket(m));
  }

  async get(user: JwtUser, id: string) {
    this.assertPlatform(user);
    const row = await this.prisma.market.findFirst({ where: { id } });
    if (!row) throw new NotFoundException("Market not found");
    return this.mapMarket(row);
  }

  async create(user: JwtUser, dto: CreateMarketDto) {
    this.assertPlatform(user);
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException("Market code is required");
    const currency = dto.defaultCurrency?.trim() || defaultCurrencyForCountry(code);
    const row = await this.prisma.market.create({
      data: {
        code,
        nameEn: dto.nameEn.trim(),
        nameAr: dto.nameAr?.trim() ?? "",
        status: MarketLaunchStatus.DRAFT,
        defaultCurrency: currency,
        defaultTimezone: dto.defaultTimezone?.trim() || "UTC",
        dataRegion: dto.dataRegion?.trim() || "eu-central-1",
        hostCell: dto.hostCell?.trim() || "frankfurt",
        defaultPhoneRegion: dto.defaultPhoneRegion?.trim() || code,
        taxConfig: (dto.taxConfig ?? {}) as Prisma.InputJsonValue,
        paymentMethods: (dto.paymentMethods ?? []) as Prisma.InputJsonValue,
      },
    });
    return this.mapMarket(row);
  }

  async listFeatureFlags(user: JwtUser, marketId: string) {
    this.assertPlatform(user);
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    return this.featureFlags.listForMarket(marketId);
  }

  async patchFeatureFlag(user: JwtUser, marketId: string, key: string, enabled: boolean) {
    this.assertPlatform(user);
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    await this.featureFlags.setMarketFlag(marketId, key, enabled);
    return this.featureFlags.listForMarket(marketId);
  }

  async launch(user: JwtUser, id: string) {
    this.assertPlatform(user);
    const row = await this.prisma.market.update({
      where: { id },
      data: { status: MarketLaunchStatus.LIVE, launchedAt: new Date() },
    });
    return this.mapMarket(row);
  }

  private mapMarket(m: {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    status: MarketLaunchStatus;
    launchedAt: Date | null;
    dataRegion: string;
    hostCell: string;
    defaultCurrency: string;
    defaultLocale: string;
    defaultTimezone: string;
    defaultPhoneRegion: string;
    paymentMethods: unknown;
    taxConfig: unknown;
    providerConfig: unknown;
  }) {
    return {
      id: m.id,
      code: m.code,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      status: m.status,
      launchedAt: m.launchedAt?.toISOString() ?? null,
      dataRegion: m.dataRegion,
      hostCell: m.hostCell,
      defaultCurrency: m.defaultCurrency,
      defaultLocale: m.defaultLocale,
      defaultTimezone: m.defaultTimezone,
      defaultPhoneRegion: m.defaultPhoneRegion,
      paymentMethods: m.paymentMethods,
      taxConfig: m.taxConfig,
      providerConfig: m.providerConfig,
    };
  }
}