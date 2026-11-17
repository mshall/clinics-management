import { Injectable } from "@nestjs/common";
import { PlanKey, SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENTITLEMENT_MIN_PLAN } from "./entitlement-catalog";
import { entitlementLimit, entitlementTruthy, parseEntitlementValue, type EntitlementValue } from "./entitlement-value";
import { PlanUpgradeRequiredException } from "./plan-upgrade-required.exception";

export type ResolvedEntitlements = {
  plan: { key: PlanKey; status: SubscriptionStatus };
  entitlements: Record<string, EntitlementValue>;
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      plan: { key: planKey, status: sub.status },
      entitlements: map,
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

  async requireEntitlement(tenantId: string, entitlement: string): Promise<void> {
    const resolved = await this.resolve(tenantId);
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