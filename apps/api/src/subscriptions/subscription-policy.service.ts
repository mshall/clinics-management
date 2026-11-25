import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SubscriptionPolicyChangeStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { commercialConfigFromFeatureDefaults, commercialConfigToFeatureDefaultsPatch, mergeFeatureDefaults } from "../markets/commercial-config.bridge";
import {
  DEFAULT_COMMERCIAL_CONFIG,
  SUBSCRIPTION_POLICY_DEFAULTS,
  safeParseCommercialConfig,
  subscriptionPolicySchema,
  type SubscriptionPolicyConfig,
} from "../markets/commercial-config.schema";

/**
 * SUB-01 maker-checker for the market subscription policy (auto-renew default, dunning end, grace, proration).
 * One platform admin proposes; a DIFFERENT platform admin approves; only then does the market pack change.
 */
@Injectable()
export class SubscriptionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
  }

  private async market(marketId: string) {
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    return row;
  }

  private current(featureDefaults: unknown): SubscriptionPolicyConfig {
    const stored = commercialConfigFromFeatureDefaults(featureDefaults).subscription;
    const parsed = subscriptionPolicySchema.safeParse({ ...SUBSCRIPTION_POLICY_DEFAULTS, ...(stored ?? {}) });
    return parsed.success ? parsed.data : { ...SUBSCRIPTION_POLICY_DEFAULTS };
  }

  async get(user: JwtUser, marketId: string) {
    this.assertPlatform(user);
    const row = await this.market(marketId);
    const pending = await this.prisma.subscriptionPolicyChange.findMany({
      where: { marketId, status: SubscriptionPolicyChangeStatus.PENDING },
      orderBy: { createdAt: "desc" },
    });
    return { marketId, policy: this.current(row.featureDefaults), defaults: SUBSCRIPTION_POLICY_DEFAULTS, pending };
  }

  async history(user: JwtUser, marketId: string) {
    this.assertPlatform(user);
    return this.prisma.subscriptionPolicyChange.findMany({ where: { marketId }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  async propose(user: JwtUser, marketId: string, body: { policy: unknown; reason: string }) {
    this.assertPlatform(user);
    if (!body.reason?.trim()) throw new BadRequestException("reason is required");
    const parsed = subscriptionPolicySchema.safeParse(body.policy);
    if (!parsed.success) {
      throw new BadRequestException({ code: "SUBSCRIPTION_POLICY_INVALID", issues: parsed.error.flatten() });
    }
    const row = await this.market(marketId);
    const before = this.current(row.featureDefaults);
    if (JSON.stringify(before) === JSON.stringify(parsed.data)) {
      throw new BadRequestException({ code: "NO_CHANGE", message: "The proposal equals the current policy" });
    }
    // The whole commercial config must stay valid with the new block (e.g. downgradeAfterDays > grace days).
    const full = commercialConfigFromFeatureDefaults(row.featureDefaults);
    const check = safeParseCommercialConfig({ ...full, subscription: parsed.data });
    if (!check.success) throw new BadRequestException({ code: "SUBSCRIPTION_POLICY_INVALID", issues: check.error.flatten() });
    return this.prisma.subscriptionPolicyChange.create({
      data: {
        marketId,
        payloadJson: parsed.data as Prisma.InputJsonValue,
        beforeJson: before as Prisma.InputJsonValue,
        reason: body.reason.trim(),
        makerId: user.userId,
      },
    });
  }

  async decide(user: JwtUser, changeId: string, body: { approve: boolean; note?: string }) {
    this.assertPlatform(user);
    const change = await this.prisma.subscriptionPolicyChange.findUnique({ where: { id: changeId } });
    if (!change) throw new NotFoundException("Change not found");
    if (change.status !== SubscriptionPolicyChangeStatus.PENDING) {
      throw new BadRequestException({ code: "ALREADY_DECIDED", message: `Change is already ${change.status}` });
    }
    if (change.makerId === user.userId) {
      throw new ForbiddenException({ code: "MAKER_CANNOT_APPROVE", message: "A different platform admin must approve this change" });
    }
    const market = await this.market(change.marketId);
    const payload = subscriptionPolicySchema.parse(change.payloadJson);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.subscriptionPolicyChange.updateMany({
        where: { id: change.id, status: SubscriptionPolicyChangeStatus.PENDING },
        data: {
          status: body.approve ? SubscriptionPolicyChangeStatus.APPROVED : SubscriptionPolicyChangeStatus.REJECTED,
          checkerId: user.userId,
          decisionNote: body.note?.trim() || null,
          decidedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw new BadRequestException({ code: "ALREADY_DECIDED" });
      if (body.approve) {
        const full = commercialConfigFromFeatureDefaults(market.featureDefaults);
        const next = { ...full, subscription: payload };
        const patch = commercialConfigToFeatureDefaultsPatch({ ...DEFAULT_COMMERCIAL_CONFIG, ...next });
        const featureDefaults = mergeFeatureDefaults(market.featureDefaults, { kiorlyBilling: { subscription: patch.kiorlyBilling && (patch.kiorlyBilling as Record<string, unknown>).subscription } });
        await tx.market.update({
          where: { id: market.id },
          data: {
            featureDefaults: featureDefaults as Prisma.InputJsonValue,
            commercialConfig: next as unknown as Prisma.InputJsonValue,
          },
        });
      }
      const auditTenant = await tx.tenant.findFirst({ where: { marketId: market.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (auditTenant) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenant.id,
            actorId: null,
            action: body.approve ? "market.subscription_policy_approved" : "market.subscription_policy_rejected",
            resource: "Market",
            resourceId: market.id,
            metadata: { changeId: change.id, makerId: change.makerId, checkerId: user.userId, reason: change.reason } as Prisma.InputJsonValue,
          },
        });
      }
    });
    return this.prisma.subscriptionPolicyChange.findUniqueOrThrow({ where: { id: change.id } });
  }
}
