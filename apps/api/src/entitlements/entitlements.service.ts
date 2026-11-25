import { Injectable } from "@nestjs/common";
import { PlanKey, SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENTITLEMENT_MIN_PLAN } from "./entitlement-catalog";
import { entitlementLimit, entitlementTruthy, parseEntitlementValue, type EntitlementValue } from "./entitlement-value";
import { liteGraceActive } from "../subscriptions/subscription-policy";
import { PlanUpgradeRequiredException } from "./plan-upgrade-required.exception";

export type ResolvedEntitlements = {
  plan: { key: PlanKey; status: SubscriptionStatus };
  entitlements: Record<string, EntitlementValue>;
  /** SUB-01: after a downgrade to Lite, modules Lite does not include stay READ-ONLY until `until` (data is never deleted). */
  liteGrace?: { until: string; readOnlyKeys: string[] } | null;
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Synthetic Enterprise entitlements for platform super admins (no tenant subscription). */
  async resolvePlatformOperator(): Promise<ResolvedEntitlements> {
    const plan = await this.prisma.plan.findUnique({ where: { key: PlanKey.ENTERPRISE } });
    if (!plan) {
      return {
        plan: { key: PlanKey.ENTERPRISE, status: SubscriptionStatus.ACTIVE },
        entitlements: { ai_assistant: true },
      };
    }
    const planEntitlements = await this.prisma.planEntitlement.findMany({ where: { planId: plan.id } });
    const map: Record<string, EntitlementValue> = {};
    for (const row of planEntitlements) {
      map[row.key] = parseEntitlementValue(row.valueJson);
    }
    return {
      plan: { key: PlanKey.ENTERPRISE, status: SubscriptionStatus.ACTIVE },
      entitlements: map,
    };
  }

  async resolve(tenantId: string): Promise<ResolvedEntitlements> {

    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: { select: { key: true, id: true } },
        trialPlan: { select: { key: true, id: true } },
      },
    });
    if (!sub) {
      return {
        plan: { key: PlanKey.LITE, status: SubscriptionStatus.ACTIVE },
        entitlements: {},
      };
    }

    const planId =
      sub.status === SubscriptionStatus.TRIALING && sub.trialPlanId ? sub.trialPlanId : sub.planId;
    const planKey =
      sub.status === SubscriptionStatus.TRIALING && sub.trialPlan
        ? sub.trialPlan.key
        : sub.plan.key;

    const planEntitlements = await this.prisma.planEntitlement.findMany({
      where: { planId },
    });

    const map: Record<string, EntitlementValue> = {};
    for (const row of planEntitlements) {
      map[row.key] = parseEntitlementValue(row.valueJson);
    }

    const overrides = await this.prisma.tenantEntitlementOverride.findMany({
      where: { tenantId },
    });
    const now = new Date();
    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt <= now) continue;
      map[o.key] = parseEntitlementValue(o.valueJson);
    }

    if (sub.status === SubscriptionStatus.READ_ONLY || sub.status === SubscriptionStatus.SUSPENDED) {
      for (const key of Object.keys(map)) {
        if (key.startsWith("mod_")) map[key] = false;
      }
    }

    // Billing seats cap (PL-02) intersects with max_clinicians from plan.
    const planMax = entitlementLimit(map.max_clinicians);
    if (planMax != null && planMax >= 0) {
      map.max_clinicians = Math.min(planMax, sub.clinicianSeats);
    } else if (planMax === null || planMax < 0) {
      map.max_clinicians = sub.clinicianSeats;
    }

    let liteGrace: ResolvedEntitlements["liteGrace"] = null;
    if (liteGraceActive(sub, now) && sub.previousPlanId) {
      const prev = await this.prisma.planEntitlement.findMany({ where: { planId: sub.previousPlanId } });
      const readOnlyKeys = prev
        .filter((r) => r.key.startsWith("mod_") && entitlementTruthy(parseEntitlementValue(r.valueJson)) && !entitlementTruthy(map[r.key]))
        .map((r) => r.key);
      if (readOnlyKeys.length > 0) liteGrace = { until: sub.liteReadOnlyGraceUntil!.toISOString(), readOnlyKeys };
    }

    return {
      plan: { key: planKey, status: sub.status },
      entitlements: map,
      liteGrace,
    };
  }

  async isEntitled(tenantId: string, key: string): Promise<boolean> {
    const { entitlements } = await this.resolve(tenantId);
    return entitlementTruthy(entitlements[key]);
  }

  async getLimit(tenantId: string, key: string): Promise<number | null> {
    const { entitlements } = await this.resolve(tenantId);
    const n = entitlementLimit(entitlements[key]);
    if (n != null && n < 0) return null;
    return n;
  }

  assertEntitled(entitlement: string, resolved: ResolvedEntitlements): void {
    if (entitlementTruthy(resolved.entitlements[entitlement])) return;
    const requiredPlan = ENTITLEMENT_MIN_PLAN[entitlement] ?? PlanKey.PRO;
    throw new PlanUpgradeRequiredException(entitlement, requiredPlan);
  }

  async requireEntitlement(tenantId: string, entitlement: string, opts: { readOnlyRequest?: boolean } = {}): Promise<void> {
    const resolved = await this.resolve(tenantId);
    // SUB-01: Lite grace window: reads of previously entitled modules still work; writes need an upgrade.
    if (opts.readOnlyRequest && resolved.liteGrace?.readOnlyKeys.includes(entitlement)) return;
    this.assertEntitled(entitlement, resolved);
  }

  async assertWithinLimit(tenantId: string, limitKey: string, projectedCount: number): Promise<void> {
    const resolved = await this.resolve(tenantId);
    const limit = entitlementLimit(resolved.entitlements[limitKey]);
    if (limit == null || limit < 0) return;
    if (projectedCount <= limit) return;
    const requiredPlan = ENTITLEMENT_MIN_PLAN[limitKey] ?? ENTITLEMENT_MIN_PLAN.max_clinicians ?? PlanKey.PRO;
    throw new PlanUpgradeRequiredException(limitKey, requiredPlan);
  }

  async countTenantClinicians(tenantId: string): Promise<number> {
    const rows = await this.prisma.employee.findMany({
      where: { tenantId, userId: { not: null }, user: { role: UserRole.PHYSICIAN, deletedAt: null } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.length;
  }

  async assertCanAddClinician(tenantId: string, physicianUserId: string): Promise<void> {
    const existing = await this.prisma.employee.findFirst({
      where: { tenantId, userId: physicianUserId },
    });
    if (existing) return;
    const count = await this.countTenantClinicians(tenantId);
    await this.assertWithinLimit(tenantId, "max_clinicians", count + 1);
  }

  async setTenantOverride(
    tenantId: string,
    key: string,
    valueJson: unknown,
    reason: string,
    createdBy: string,
    expiresAt?: Date | null,
  ) {
    return this.prisma.tenantEntitlementOverride.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        tenantId,
        key,
        valueJson: valueJson as never,
        reason,
        createdBy,
        expiresAt: expiresAt ?? null,
      },
      update: {
        valueJson: valueJson as never,
        reason,
        createdBy,
        expiresAt: expiresAt ?? null,
      },
    });
  }
}