import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicalSpecialty, FeeType, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { firstTenantIdInMarket } from "../audit/market-audit-anchor";
import {
  kiorexPackFromFeatureDefaults,
  resolveBenchmarkTargetRatio,
} from "./kiorex-commission-config";
import {
  applyPercentCommission,
  effectiveFlatFee,
  isAboveBenchmarkTarget,
  resolveKiorexCommissionRate,
  type RateRow,
} from "./kiorex-commission-resolver";

export type KiorexRateView = {
  id: string;
  marketId: string;
  marketCode: string;
  specialty: ClinicalSpecialty | null;
  feeType: FeeType;
  amount: string | null;
  percent: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  benchmarkFlat: string | null;
  benchmarkPercent: string | null;
  benchmarkSource: string | null;
  benchmarkCheckedAt: string | null;
  validFrom: string;
  validTo: string | null;
  aboveBenchmarkTarget: boolean;
  benchmarkTargetRatio: number;
  effectiveFeeExample: number | null;
  currency: string;
};

@Injectable()
export class KiorexCommissionService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can use this API");
    }
  }

  private mapRow(
    row: RateRow & { market: { code: string; defaultCurrency: string; featureDefaults: Prisma.JsonValue } },
  ): KiorexRateView {
    const targetRatio = resolveBenchmarkTargetRatio(row.market.featureDefaults);
    return {
      id: row.id,
      marketId: row.marketId,
      marketCode: row.market.code,
      specialty: row.specialty,
      feeType: row.feeType,
      amount: row.amount?.toString() ?? null,
      percent: row.percent?.toString() ?? null,
      minAmount: row.minAmount?.toString() ?? null,
      maxAmount: row.maxAmount?.toString() ?? null,
      benchmarkFlat: row.benchmarkFlat?.toString() ?? null,
      benchmarkPercent: row.benchmarkPercent?.toString() ?? null,
      benchmarkSource: row.benchmarkSource,
      benchmarkCheckedAt: row.benchmarkCheckedAt?.toISOString() ?? null,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo?.toISOString() ?? null,
      aboveBenchmarkTarget: isAboveBenchmarkTarget(row, targetRatio),
      benchmarkTargetRatio: targetRatio,
      effectiveFeeExample: effectiveFlatFee(row),
      currency: row.market.defaultCurrency,
    };
  }

  async listForPlatform(user: JwtUser, marketId?: string): Promise<KiorexRateView[]> {
    this.assertPlatform(user);
    const rows = await this.prisma.kiorexCommissionRate.findMany({
      where: marketId?.trim() ? { marketId: marketId.trim() } : undefined,
      include: { market: { select: { code: true, defaultCurrency: true, featureDefaults: true } } },
      orderBy: [{ market: { code: "asc" } }, { specialty: "asc" }, { validFrom: "desc" }],
    });
    return rows.map((r) => this.mapRow(r));
  }

  async create(
    user: JwtUser,
    body: {
      marketId: string;
      specialty?: ClinicalSpecialty | null;
      feeType: FeeType;
      amount?: number | string | null;
      percent?: number | string | null;
      minAmount?: number | string | null;
      maxAmount?: number | string | null;
      benchmarkFlat?: number | string | null;
      benchmarkPercent?: number | string | null;
      benchmarkSource?: string | null;
      benchmarkCheckedAt?: string | null;
      validFrom?: string;
      validTo?: string | null;
    },
  ): Promise<KiorexRateView> {
    this.assertPlatform(user);
    const market = await this.prisma.market.findUnique({ where: { id: body.marketId.trim() } });
    if (!market) throw new NotFoundException("Market not found");
    this.validateFeePayload(body);

    const auditTenantId = await firstTenantIdInMarket(this.prisma, market.id);

    const row = await this.prisma.kiorexCommissionRate.create({
      data: {
        marketId: market.id,
        specialty: body.specialty ?? null,
        feeType: body.feeType,
        amount: body.amount != null ? new Prisma.Decimal(String(body.amount)) : null,
        percent: body.percent != null ? new Prisma.Decimal(String(body.percent)) : null,
        minAmount: body.minAmount != null ? new Prisma.Decimal(String(body.minAmount)) : null,
        maxAmount: body.maxAmount != null ? new Prisma.Decimal(String(body.maxAmount)) : null,
        benchmarkFlat: body.benchmarkFlat != null ? new Prisma.Decimal(String(body.benchmarkFlat)) : null,
        benchmarkPercent: body.benchmarkPercent != null ? new Prisma.Decimal(String(body.benchmarkPercent)) : null,
        benchmarkSource: body.benchmarkSource?.trim() || null,
        benchmarkCheckedAt: body.benchmarkCheckedAt ? new Date(body.benchmarkCheckedAt) : null,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
      include: { market: { select: { code: true, defaultCurrency: true, featureDefaults: true } } },
    });
    if (auditTenantId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: auditTenantId,
          actorId: user.userId,
          action: "kiorex.rate.created",
          resource: "KiorexCommissionRate",
          resourceId: row.id,
          metadata: {
            marketId: market.id,
            marketCode: market.code,
            feeType: row.feeType,
            specialty: row.specialty,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return this.mapRow(row);
  }

  async patch(
    user: JwtUser,
    id: string,
    body: Partial<{
      specialty: ClinicalSpecialty | null;
      feeType: FeeType;
      amount: number | string | null;
      percent: number | string | null;
      minAmount: number | string | null;
      maxAmount: number | string | null;
      benchmarkFlat: number | string | null;
      benchmarkPercent: number | string | null;
      benchmarkSource: string | null;
      benchmarkCheckedAt: string | null;
      validFrom: string;
      validTo: string | null;
    }>,
  ): Promise<KiorexRateView> {
    this.assertPlatform(user);
    const existing = await this.prisma.kiorexCommissionRate.findUnique({
      where: { id },
      include: { market: { select: { code: true, defaultCurrency: true, featureDefaults: true } } },
    });
    if (!existing) throw new NotFoundException("Rate not found");

    const merged = {
      feeType: body.feeType ?? existing.feeType,
      amount: body.amount !== undefined ? body.amount : existing.amount?.toString() ?? null,
      percent: body.percent !== undefined ? body.percent : existing.percent?.toString() ?? null,
    };
    this.validateFeePayload({ feeType: merged.feeType, amount: merged.amount, percent: merged.percent });

    const row = await this.prisma.kiorexCommissionRate.update({
      where: { id },
      data: {
        ...(body.specialty !== undefined ? { specialty: body.specialty } : {}),
        ...(body.feeType !== undefined ? { feeType: body.feeType } : {}),
        ...(body.amount !== undefined
          ? { amount: body.amount != null ? new Prisma.Decimal(String(body.amount)) : null }
          : {}),
        ...(body.percent !== undefined
          ? { percent: body.percent != null ? new Prisma.Decimal(String(body.percent)) : null }
          : {}),
        ...(body.minAmount !== undefined
          ? { minAmount: body.minAmount != null ? new Prisma.Decimal(String(body.minAmount)) : null }
          : {}),
        ...(body.maxAmount !== undefined
          ? { maxAmount: body.maxAmount != null ? new Prisma.Decimal(String(body.maxAmount)) : null }
          : {}),
        ...(body.benchmarkFlat !== undefined
          ? { benchmarkFlat: body.benchmarkFlat != null ? new Prisma.Decimal(String(body.benchmarkFlat)) : null }
          : {}),
        ...(body.benchmarkPercent !== undefined
          ? {
              benchmarkPercent:
                body.benchmarkPercent != null ? new Prisma.Decimal(String(body.benchmarkPercent)) : null,
            }
          : {}),
        ...(body.benchmarkSource !== undefined ? { benchmarkSource: body.benchmarkSource?.trim() || null } : {}),
        ...(body.benchmarkCheckedAt !== undefined
          ? { benchmarkCheckedAt: body.benchmarkCheckedAt ? new Date(body.benchmarkCheckedAt) : null }
          : {}),
        ...(body.validFrom !== undefined ? { validFrom: new Date(body.validFrom) } : {}),
        ...(body.validTo !== undefined ? { validTo: body.validTo ? new Date(body.validTo) : null } : {}),
      },
      include: { market: { select: { code: true, defaultCurrency: true, featureDefaults: true } } },
    });
    const auditTenantId = await firstTenantIdInMarket(this.prisma, existing.marketId);
    if (auditTenantId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: auditTenantId,
          actorId: user.userId,
          action: "kiorex.rate.updated",
          resource: "KiorexCommissionRate",
          resourceId: row.id,
          metadata: { marketId: existing.marketId } as Prisma.InputJsonValue,
        },
      });
    }
    return this.mapRow(row);
  }

  async remove(user: JwtUser, id: string): Promise<{ ok: true }> {
    this.assertPlatform(user);
    const existing = await this.prisma.kiorexCommissionRate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Rate not found");
    const auditTenantId = await firstTenantIdInMarket(this.prisma, existing.marketId);
    await this.prisma.kiorexCommissionRate.delete({ where: { id } });
    if (auditTenantId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: auditTenantId,
          actorId: user.userId,
          action: "kiorex.rate.removed",
          resource: "KiorexCommissionRate",
          resourceId: id,
          metadata: { marketId: existing.marketId } as Prisma.InputJsonValue,
        },
      });
    }
    return { ok: true };
  }

  async patchMarketSettings(
    user: JwtUser,
    marketId: string,
    body: { benchmarkTargetRatio?: number; liteMonthlyCap?: number | null },
  ) {
    this.assertPlatform(user);
    const market = await this.prisma.market.findUnique({ where: { id: marketId.trim() } });
    if (!market) throw new NotFoundException("Market not found");
    const current =
      market.featureDefaults && typeof market.featureDefaults === "object" && !Array.isArray(market.featureDefaults)
        ? (market.featureDefaults as Record<string, unknown>)
        : {};
    const kiorexCurrent = kiorexPackFromFeatureDefaults(market.featureDefaults);
    const nextKiorex = {
      ...kiorexCurrent,
      ...(body.benchmarkTargetRatio !== undefined ? { benchmarkTargetRatio: body.benchmarkTargetRatio } : {}),
      ...(body.liteMonthlyCap !== undefined ? { liteMonthlyCap: body.liteMonthlyCap } : {}),
    };
    await this.prisma.market.update({
      where: { id: market.id },
      data: {
        featureDefaults: { ...current, kiorex: nextKiorex } as Prisma.InputJsonValue,
      },
    });
    const auditTenantId = await firstTenantIdInMarket(this.prisma, market.id);
    if (auditTenantId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: auditTenantId,
          actorId: user.userId,
          action: "kiorex.market_settings.updated",
          resource: "Market",
          resourceId: market.id,
          metadata: {
            benchmarkTargetRatio: nextKiorex.benchmarkTargetRatio,
            liteMonthlyCap: nextKiorex.liteMonthlyCap,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return nextKiorex;
  }

  private validateFeePayload(body: { feeType: FeeType; amount?: unknown; percent?: unknown }): void {
    if (body.feeType === FeeType.FLAT) {
      if (body.amount == null || body.amount === "") {
        throw new BadRequestException("FLAT fee requires amount");
      }
    } else if (body.feeType === FeeType.PERCENT) {
      if (body.percent == null || body.percent === "") {
        throw new BadRequestException("PERCENT fee requires percent");
      }
    }
  }

  async listPublic(marketCode: string) {
    const market = await this.prisma.market.findFirst({ where: { code: marketCode.toUpperCase() } });
    if (!market) throw new NotFoundException("Market not found");

    const rows = await this.prisma.kiorexCommissionRate.findMany({
      where: { marketId: market.id },
      include: { market: { select: { code: true, defaultCurrency: true, featureDefaults: true } } },
    });
    const at = new Date();
    const targetRatio = resolveBenchmarkTargetRatio(market.featureDefaults);
    const pack = kiorexPackFromFeatureDefaults(market.featureDefaults);

    const specialties = [...new Set(rows.map((r) => r.specialty).filter(Boolean))] as ClinicalSpecialty[];
    const resolved: Array<{
      specialty: ClinicalSpecialty | null;
      feeType: FeeType;
      amount: string | null;
      percent: string | null;
      minAmount: string | null;
      maxAmount: string | null;
      effectiveFeeExample: number | null;
      aboveBenchmarkTarget: boolean;
    }> = [];

    const defaultRate = resolveKiorexCommissionRate(rows, null, at);
    if (defaultRate) {
      const full = rows.find((r) => r.id === defaultRate.id)!;
      resolved.push({
        specialty: null,
        feeType: full.feeType,
        amount: full.amount?.toString() ?? null,
        percent: full.percent?.toString() ?? null,
        minAmount: full.minAmount?.toString() ?? null,
        maxAmount: full.maxAmount?.toString() ?? null,
        effectiveFeeExample: effectiveFlatFee(full),
        aboveBenchmarkTarget: isAboveBenchmarkTarget(full, targetRatio),
      });
    }

    for (const sp of specialties) {
      const rate = resolveKiorexCommissionRate(rows, sp, at);
      if (!rate) continue;
      const full = rows.find((r) => r.id === rate.id)!;
      resolved.push({
        specialty: sp,
        feeType: full.feeType,
        amount: full.amount?.toString() ?? null,
        percent: full.percent?.toString() ?? null,
        minAmount: full.minAmount?.toString() ?? null,
        maxAmount: full.maxAmount?.toString() ?? null,
        effectiveFeeExample: effectiveFlatFee(full),
        aboveBenchmarkTarget: isAboveBenchmarkTarget(full, targetRatio),
      });
    }

    return {
      market: market.code,
      currency: market.defaultCurrency,
      benchmarkTargetRatio: targetRatio,
      liteMonthlyCap: pack.liteMonthlyCap ?? null,
      rates: resolved,
    };
  }

  resolveForBooking(
    rows: RateRow[],
    specialty: ClinicalSpecialty | null | undefined,
    visitFee: number,
    at: Date = new Date(),
  ): { commissionAmount: number; rate: RateRow | null } {
    const rate = resolveKiorexCommissionRate(rows, specialty, at);
    if (!rate) return { commissionAmount: 0, rate: null };
    if (rate.feeType === FeeType.FLAT) {
      return { commissionAmount: rate.amount != null ? Number(rate.amount) : 0, rate };
    }
    if (rate.percent == null) return { commissionAmount: 0, rate };
    return {
      commissionAmount: applyPercentCommission(
        visitFee,
        Number(rate.percent),
        rate.minAmount != null ? Number(rate.minAmount) : null,
        rate.maxAmount != null ? Number(rate.maxAmount) : null,
      ),
      rate,
    };
  }
}