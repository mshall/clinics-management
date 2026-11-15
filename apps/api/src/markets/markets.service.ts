import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MarketLaunchStatus, MarketOperationalStatus, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { defaultCurrencyForCountry } from "../common/country-default-currency";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { effectiveOperationalStatus, marketAcceptsNewTenants, marketOperabilityLabel } from "./market-operational";
import { MarketProvisionService } from "./market-provision.service";
import type { PatchMarketDto } from "./dto/patch-market.dto";

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
    private readonly provision: MarketProvisionService,
  ) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new BadRequestException("Platform super admin only");
  }

  async refreshExpiredPauses(): Promise<number> {
    const result = await this.prisma.market.updateMany({
      where: {
        operationalStatus: MarketOperationalStatus.PAUSED,
        pausedUntil: { lte: new Date() },
      },
      data: { operationalStatus: MarketOperationalStatus.ACTIVE, pausedUntil: null },
    });
    return result.count;
  }

  async list(user: JwtUser) {
    this.assertPlatform(user);
    await this.refreshExpiredPauses();
    const rows = await this.prisma.market.findMany({ orderBy: { code: "asc" } });
    return rows.map((m) => this.mapMarket(m));
  }

  async listOperable(user: JwtUser) {
    this.assertPlatform(user);
    return this.listOperableForOnboarding();
  }

  async listOperableForOnboarding(): Promise<
    Array<{ id: string; code: string; nameEn: string; defaultCurrency: string; hostCell: string }>
  > {
    await this.refreshExpiredPauses();
    const rows = await this.prisma.market.findMany({
      where: { status: MarketLaunchStatus.LIVE },
      orderBy: { code: "asc" },
    });
    return rows
      .filter((m) => marketAcceptsNewTenants(m))
      .map((m) => ({
        id: m.id,
        code: m.code,
        nameEn: m.nameEn,
        defaultCurrency: m.defaultCurrency,
        hostCell: m.hostCell,
      }));
  }

  async get(user: JwtUser, id: string) {
    this.assertPlatform(user);
    await this.refreshExpiredPauses();
    const row = await this.prisma.market.findFirst({ where: { id } });
    if (!row) throw new NotFoundException("Market not found");
    return this.mapMarket(row);
  }

  async assertMarketForNewTenant(marketId: string) {
    await this.refreshExpiredPauses();
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new BadRequestException("Market not found");
    if (!marketAcceptsNewTenants(row)) {
      const op = marketOperabilityLabel(row);
      throw new BadRequestException(`Market is not accepting new organizations (${op})`);
    }
    return row;
  }

  async create(user: JwtUser, dto: CreateMarketDto) {
    this.assertPlatform(user);
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException("Market code is required");
    const currency = dto.defaultCurrency?.trim() || defaultCurrencyForCountry(code);
    const dataRegion = dto.dataRegion?.trim() || "eu-central-1";
    const hostCell = dto.hostCell?.trim() || dataRegion;
    const row = await this.prisma.market.create({
      data: {
        code,
        nameEn: dto.nameEn.trim(),
        nameAr: dto.nameAr?.trim() ?? "",
        status: MarketLaunchStatus.DRAFT,
        defaultCurrency: currency,
        defaultTimezone: dto.defaultTimezone?.trim() || "UTC",
        dataRegion,
        hostCell,
        defaultPhoneRegion: dto.defaultPhoneRegion?.trim() || code,
        taxConfig: (dto.taxConfig ?? {}) as Prisma.InputJsonValue,
        paymentMethods: (dto.paymentMethods ?? []) as Prisma.InputJsonValue,
      },
    });
    return this.mapMarket(row);
  }

  async patch(user: JwtUser, id: string, dto: PatchMarketDto) {
    this.assertPlatform(user);
    const existing = await this.prisma.market.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Market not found");
    const data: Prisma.MarketUpdateInput = {};
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn.trim();
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr.trim();
    if (dto.dataRegion !== undefined) data.dataRegion = dto.dataRegion.trim();
    if (dto.hostCell !== undefined) data.hostCell = dto.hostCell.trim();
    if (dto.defaultCurrency !== undefined) data.defaultCurrency = dto.defaultCurrency.trim();
    if (dto.defaultTimezone !== undefined) data.defaultTimezone = dto.defaultTimezone.trim();
    if (dto.defaultPhoneRegion !== undefined) data.defaultPhoneRegion = dto.defaultPhoneRegion.trim();
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");
    const row = await this.prisma.market.update({ where: { id }, data });
    return this.mapMarket(row);
  }

  async remove(user: JwtUser, id: string) {
    this.assertPlatform(user);
    const row = await this.prisma.market.findFirst({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!row) throw new NotFoundException("Market not found");
    if (row.status !== MarketLaunchStatus.DRAFT) {
      throw new BadRequestException("Only draft markets can be deleted");
    }
    if (row._count.tenants > 0) throw new BadRequestException("Market has organizations — cannot delete");
    await this.prisma.market.delete({ where: { id } });
    return { ok: true as const };
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
    const existing = await this.prisma.market.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Market not found");
    if (existing.status === MarketLaunchStatus.LIVE) {
      throw new BadRequestException("Market is already live");
    }
    const provision = this.provision.resolveProvision(existing.dataRegion, existing.hostCell);
    let note = provision.message;
    const deployLog = await this.provision.tryTriggerDeploy(provision.dataRegion);
    if (deployLog) note = `${note}\n${deployLog}`;

    const row = await this.prisma.market.update({
      where: { id },
      data: {
        status: MarketLaunchStatus.LIVE,
        launchedAt: new Date(),
        operationalStatus: MarketOperationalStatus.ACTIVE,
        pausedUntil: null,
        lastProvisionNote: note,
      },
    });
    return { ...this.mapMarket(row), provision: { mode: provision.mode, message: note } };
  }

  async pause(user: JwtUser, id: string, days: number) {
    this.assertPlatform(user);
    const d = Math.min(365, Math.max(1, Math.floor(days) || 7));
    const existing = await this.prisma.market.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Market not found");
    if (existing.status !== MarketLaunchStatus.LIVE) {
      throw new BadRequestException("Only live markets can be paused");
    }
    const pausedUntil = new Date();
    pausedUntil.setUTCDate(pausedUntil.getUTCDate() + d);
    const row = await this.prisma.market.update({
      where: { id },
      data: { operationalStatus: MarketOperationalStatus.PAUSED, pausedUntil },
    });
    return this.mapMarket(row);
  }

  async disable(user: JwtUser, id: string) {
    this.assertPlatform(user);
    const existing = await this.prisma.market.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Market not found");
    if (existing.status !== MarketLaunchStatus.LIVE) {
      throw new BadRequestException("Only live markets can be disabled");
    }
    const row = await this.prisma.market.update({
      where: { id },
      data: { operationalStatus: MarketOperationalStatus.DISABLED, pausedUntil: null },
    });
    return this.mapMarket(row);
  }

  async enable(user: JwtUser, id: string) {
    this.assertPlatform(user);
    const existing = await this.prisma.market.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Market not found");
    const row = await this.prisma.market.update({
      where: { id },
      data: { operationalStatus: MarketOperationalStatus.ACTIVE, pausedUntil: null },
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
    operationalStatus: MarketOperationalStatus;
    pausedUntil: Date | null;
    lastProvisionNote: string | null;
  }) {
    const op = effectiveOperationalStatus(m);
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
      operationalStatus: op,
      operability: marketOperabilityLabel(m),
      pausedUntil: m.pausedUntil?.toISOString() ?? null,
      lastProvisionNote: m.lastProvisionNote,
      acceptsNewOrganizations: m.status === MarketLaunchStatus.LIVE && op === MarketOperationalStatus.ACTIVE,
    };
  }
}