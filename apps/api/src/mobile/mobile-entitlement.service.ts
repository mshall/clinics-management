import { Injectable, Optional } from "@nestjs/common";
import { PlanKey, SubscriptionStatus } from "@prisma/client";
import { entitlementTruthy } from "../entitlements/entitlement-value";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { KiorexFlagSnapshotService } from "../feature-flags/kiorex-flag-snapshot.service";
import { PrismaService } from "../prisma/prisma.service";

export const MOBILE_ENTITLEMENT_KEY = "mobile_staff_app" as const;
export type MobilePlan = "BASIC" | "PRO" | "ENTERPRISE";

/** Clinic plan keys onto the cross-product plan names: LITE/NURSE_LITE = BASIC, PRO/CLINIC/NURSE_PRO = PRO, ENTERPRISE/NURSE_AGENCY = ENTERPRISE. */
export const PLAN_OF_KEY: Record<PlanKey, MobilePlan> = {
  LITE: "BASIC",
  NURSE_LITE: "BASIC",
  PRO: "PRO",
  CLINIC: "PRO",
  NURSE_PRO: "PRO",
  ENTERPRISE: "ENTERPRISE",
  NURSE_AGENCY: "ENTERPRISE",
};

export interface MobileEntitlement {
  key: typeof MOBILE_ENTITLEMENT_KEY;
  enabled: boolean;
  requiredPlan: "PRO";
  reason: null | "PLAN_BELOW_PRO" | "FLAG_OFF";
  plan: MobilePlan;
  rawPlan: PlanKey;
  scope?: "global" | "market" | "org";
}

/**
 * Commercial entitlement (PlanEntitlement `mobile_staff_app`, per-tenant override honoured) AND the Kiorex control plane has not switched it OFF
 * (global / market / org snapshot). NOT a safety control: the alert inbox never calls this (ADR-025).
 */
@Injectable()
export class MobileEntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly snapshots?: KiorexFlagSnapshotService,
  ) {}

  async evaluate(tenantId: string): Promise<MobileEntitlement> {
    const base = { key: MOBILE_ENTITLEMENT_KEY, requiredPlan: "PRO" as const };
    const resolved = await this.entitlements.resolve(tenantId);
    const plan = PLAN_OF_KEY[resolved.plan.key];
    const rawPlan = resolved.plan.key;
    const planEnabled = entitlementTruthy(resolved.entitlements[MOBILE_ENTITLEMENT_KEY]);
    if (!planEnabled) return { ...base, enabled: false, reason: plan === "BASIC" ? "PLAN_BELOW_PRO" : "FLAG_OFF", plan, rawPlan, scope: "org" };
    if (resolved.plan.status === SubscriptionStatus.SUSPENDED) return { ...base, enabled: false, reason: "FLAG_OFF", plan, rawPlan, scope: "org" };
    const v = this.snapshots?.getFlag(MOBILE_ENTITLEMENT_KEY)?.values;
    if (v) {
      if (v.global === "OFF") return { ...base, enabled: false, reason: "FLAG_OFF", plan, rawPlan, scope: "global" };
      const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { code: true } } } });
      const code = t?.market?.code?.toUpperCase();
      if (code && Object.entries(v.markets ?? {}).some(([k, val]) => k.toUpperCase() === code && val === "OFF")) return { ...base, enabled: false, reason: "FLAG_OFF", plan, rawPlan, scope: "market" };
      if (v.orgs?.[tenantId] === "OFF") return { ...base, enabled: false, reason: "FLAG_OFF", plan, rawPlan, scope: "org" };
    }
    return { ...base, enabled: true, reason: null, plan, rawPlan };
  }
}
