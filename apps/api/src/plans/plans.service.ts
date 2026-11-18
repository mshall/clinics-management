import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BillingInterval,
  PlanKey,
  PriceUnit,
  Prisma,
  type PlanEntitlement,
  type PlanPrice,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ACTIVE_PRICE_WHERE, isPlanPriceActive } from "./plans-active-prices";
import { PriceIndexationService, type PriceImpactPreview } from "./price-indexation.service";

export type PublicPlanDto = {
  key: PlanKey;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  entitlements: Array<{ key: string; value: unknown }>;
  prices: Array<{
    id: string;
    currency: string;
    interval: BillingInterval;
    unit: PriceUnit;
    amount: string;
    includedClinicians: number;
    extraClinicianAmount: string | null;
    priceVersion: number;
    cohortKey: string | null;
  }>;
};

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexation: PriceIndexationService,
  ) {}

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can use this API");
    }
  }

  private mapPrice(price: PlanPrice) {
    return {
      id: price.id,
      planId: price.planId,
      marketId: price.marketId,
      currency: price.currency,
      interval: price.interval,
      unit: price.unit,
      amount: price.amount.toString(),
      includedClinicians: price.includedClinicians,
      extraClinicianAmount: price.extraClinicianAmount?.toString() ?? null,
      cohortKey: price.cohortKey,
      priceVersion: price.priceVersion,
      validFrom: price.validFrom.toISOString(),
      validTo: price.validTo?.toISOString() ?? null,
    };
  }

  private mapEntitlements(rows: PlanEntitlement[]) {
    return rows.map((e) => ({ key: e.key, value: e.valueJson }));
  }

  async listPublicPlans(marketCode: string, at: Date = new Date()): Promise<{
    market: { code: string; currency: string };
    plans: PublicPlanDto[];
  }> {
    const code = marketCode.trim().toUpperCase();
    if (!code) throw new BadRequestException("market query is required");
    const market = await this.prisma.market.findFirst({ where: { code } });
    if (!market) throw new NotFoundException(`Market ${code} not found`);

    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: "asc" },
      include: {
        entitlements: { orderBy: { key: "asc" } },
        prices: {
          where: {
            marketId: market.id,
            ...ACTIVE_PRICE_WHERE(at),
          },
          orderBy: [{ interval: "asc" }, { unit: "asc" }, { priceVersion: "desc" }],
        },
      },
    });

    return {
      market: { code: market.code, currency: market.defaultCurrency },
      plans: plans.map((plan) => ({
        key: plan.key,
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        sortOrder: plan.sortOrder,
        entitlements: this.mapEntitlements(plan.entitlements),
        prices: plan.prices.map((p) => ({
          id: p.id,
          currency: p.currency,
          interval: p.interval,
          unit: p.unit,
          amount: p.amount.toString(),
          includedClinicians: p.includedClinicians,
          extraClinicianAmount: p.extraClinicianAmount?.toString() ?? null,
          priceVersion: p.priceVersion,
          cohortKey: p.cohortKey,
        })),
      })),
    };
  }

  async listAllPlans(user: JwtUser) {
    this.assertPlatform(user);
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        entitlements: { orderBy: { key: "asc" } },
        prices: { orderBy: [{ marketId: "asc" }, { interval: "asc" }, { priceVersion: "desc" }] },
      },
    });
    return plans.map((p) => ({
      id: p.id,
      key: p.key,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      isPublic: p.isPublic,
      sortOrder: p.sortOrder,
      entitlements: this.mapEntitlements(p.entitlements),
      prices: p.prices.map((price) => this.mapPrice(price)),
    }));
  }

  async createPlan(
    user: JwtUser,
    body: {
      key: PlanKey;
      nameEn: string;
      nameAr?: string;
      isPublic?: boolean;
      sortOrder?: number;
    },
  ) {
    this.assertPlatform(user);
    const nameEn = body.nameEn?.trim();
    if (!nameEn) throw new BadRequestException("nameEn required");
    return this.prisma.plan.create({
      data: {
        key: body.key,
        nameEn,
        nameAr: body.nameAr?.trim() ?? "",
        isPublic: body.isPublic !== false,
        sortOrder: Number(body.sortOrder ?? 0),
      },
    });
  }

  async patchPlan(
    user: JwtUser,
    planId: string,
    body: Partial<{ nameEn: string; nameAr: string; isPublic: boolean; sortOrder: number }>,
  ) {
    this.assertPlatform(user);
    const existing = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) throw new NotFoundException("Plan not found");
    return this.prisma.plan.update({
      where: { id: planId },
      data: {
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn.trim() } : {}),
        ...(body.nameAr !== undefined ? { nameAr: body.nameAr.trim() } : {}),
        ...(body.isPublic !== undefined ? { isPublic: Boolean(body.isPublic) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });
  }

  async listPlanPrices(user: JwtUser, planId: string, marketId?: string) {
    this.assertPlatform(user);
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException("Plan not found");
    const rows = await this.prisma.planPrice.findMany({
      where: {
        planId,
        ...(marketId ? { marketId } : {}),
      },
      orderBy: [{ marketId: "asc" }, { interval: "asc" }, { priceVersion: "desc" }],
    });
    return rows.map((p) => this.mapPrice(p));
  }

  async createPlanPrice(
    user: JwtUser,
    planId: string,
    body: {
      marketId: string;
      currency: string;
      interval: BillingInterval;
      unit: PriceUnit;
      amount: number | string;
      includedClinicians?: number;
      extraClinicianAmount?: number | string | null;
      cohortKey?: string | null;
      validFrom?: string;
      newVersion?: boolean;
      /** SB-06: return the impact on existing subscriptions without publishing. */
      preview?: boolean;
    },
  ) {
    this.assertPlatform(user);
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException("Plan not found");

    const market = await this.prisma.market.findUnique({ where: { id: body.marketId } });
    if (!market) throw new BadRequestException("Unknown marketId");

    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    if (Number.isNaN(validFrom.getTime())) throw new BadRequestException("validFrom invalid");

    const cohortKey = body.cohortKey?.trim() || null;
    const segmentWhere = {
      planId,
      marketId: body.marketId,
      interval: body.interval,
      unit: body.unit,
      cohortKey,
    };

    const activeRows = await this.prisma.planPrice.findMany({
      where: { ...segmentWhere, ...ACTIVE_PRICE_WHERE(validFrom) },
    });

    const nextVersion =
      (await this.prisma.planPrice.aggregate({
        where: segmentWhere,
        _max: { priceVersion: true },
      }))._max.priceVersion ?? 0;

    const priceVersion = body.newVersion !== false && activeRows.length > 0 ? nextVersion + 1 : nextVersion || 1;
    const supersedes = body.newVersion !== false && activeRows.length > 0;

    const amount = new Prisma.Decimal(String(body.amount));
    if (amount.isNaN() || amount.lt(0)) throw new BadRequestException("amount invalid");
    const includedClinicians = Number(body.includedClinicians ?? 1);
    const extraClinicianAmount =
      body.extraClinicianAmount != null && body.extraClinicianAmount !== ""
        ? new Prisma.Decimal(String(body.extraClinicianAmount))
        : null;

    if (body.preview) {
      const impact = await this.indexation.previewImpact(
        segmentWhere,
        {
          interval: body.interval,
          unit: body.unit,
          amount: Number(amount),
          includedClinicians,
          extraClinicianAmount: extraClinicianAmount != null ? Number(extraClinicianAmount) : null,
          currency: body.currency.trim(),
        },
        { notBefore: validFrom },
      );
      return { preview: true as const, priceVersion, supersedes, impact };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (body.newVersion !== false && activeRows.length > 0) {
        for (const row of activeRows) {
          if (!row.validTo || row.validTo > validFrom) {
            await tx.planPrice.update({
              where: { id: row.id },
              data: { validTo: validFrom },
            });
          }
        }
      }

      const created = await tx.planPrice.create({
        data: {
          planId,
          marketId: body.marketId,
          currency: body.currency.trim(),
          interval: body.interval,
          unit: body.unit,
          amount,
          includedClinicians,
          extraClinicianAmount,
          cohortKey,
          priceVersion,
          validFrom,
        },
      });

      const impact: PriceImpactPreview | null = supersedes
        ? await this.indexation.scheduleForNewPrice(tx, segmentWhere, created)
        : null;

      const auditTenant = await tx.tenant.findFirst({
        where: { marketId: body.marketId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (auditTenant) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenant.id,
            actorId: user.userId,
            action: "plan.price.published",
            resource: "PlanPrice",
            resourceId: created.id,
            metadata: {
              planId,
              marketId: body.marketId,
              amount: created.amount.toFixed(2),
              currency: created.currency,
              priceVersion,
              tenantsAffected: impact?.tenantsAffected ?? 0,
              mrrDelta: impact?.mrrDelta ?? "0.00",
            } as Prisma.InputJsonValue,
          },
        });
      }

      return { ...this.mapPrice(created), impact };
    });
    if (result.impact && result.impact.tenantsAffected > 0) {
      await this.indexation.sendDueNotices();
    }
    return result;
  }

  /** Subscriptions keep their planPrice row until an SB-06 PlanPriceMigration applies at renewal. */
  async subscriptionPriceAmount(tenantId: string): Promise<string | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { planPrice: true },
    });
    return sub?.planPrice?.amount.toString() ?? null;
  }

  assertPriceStillActive(price: PlanPrice, at: Date = new Date()): void {
    if (!isPlanPriceActive(price, at)) {
      throw new BadRequestException("Plan price is no longer active");
    }
  }
}