import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { ensurePlanCatalog } from "../../prisma/plan-catalog-seed";
import { ensurePlanEntitlements } from "../../prisma/plans.seed";
import { EntitlementsService } from "./entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PlanUpgradeRequiredException } from "./plan-upgrade-required.exception";

const prisma = new PrismaClient();
const entitlements = new EntitlementsService(prisma as unknown as PrismaService);
const featureFlags = new FeatureFlagsService(prisma as unknown as PrismaService, entitlements);

describe("PL-03 entitlements resolution", () => {
  let tenantId: string;

  before(async () => {
    await prisma.$connect();
    await ensurePlanCatalog(prisma);
    await ensurePlanEntitlements(prisma);
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = tenant.id;

    await prisma.subscription.update({
      where: { tenantId },
      data: {
        planId: lite.id,
        status: SubscriptionStatus.ACTIVE,
        trialPlanId: null,
        clinicianSeats: 2,
      },
    });

    await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId } });
    void pro;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("Lite tenant is not entitled to eta_receipts (402 payload)", async () => {
    await assert.rejects(
      () => entitlements.requireEntitlement(tenantId, "eta_receipts"),
      (err: unknown) => {
        assert.ok(err instanceof PlanUpgradeRequiredException);
        const body = err.getResponse() as { code: string; requiredPlan: string };
        assert.equal(body.code, "PLAN_UPGRADE_REQUIRED");
        assert.equal(body.requiredPlan, PlanKey.PRO);
        return true;
      },
    );
  });

  it("feature flag layer respects plan before org toggle", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "eta_receipts" },
      create: { key: "eta_receipts", enabled: true },
      update: { enabled: true },
    });
    await prisma.tenantFeatureFlag.upsert({
      where: { tenantId_key: { tenantId, key: "eta_receipts" } },
      create: { tenantId, key: "eta_receipts", enabled: true },
      update: { enabled: true },
    });
    const enabled = await featureFlags.isEnabled(tenantId, "eta_receipts");
    assert.equal(enabled, false);
  });

  it("trial uses trial plan entitlements", async () => {
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    await prisma.subscription.update({
      where: { tenantId },
      data: {
        status: SubscriptionStatus.TRIALING,
        planId: lite.id,
        trialPlanId: pro.id,
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    const resolved = await entitlements.resolve(tenantId);
    assert.equal(resolved.plan.key, PlanKey.PRO);
    assert.ok(entitlementTruthy(resolved.entitlements.eta_receipts));
  });

  it("expired override is ignored", async () => {
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId } });
    await prisma.subscription.update({
      where: { tenantId },
      data: {
        planId: lite.id,
        status: SubscriptionStatus.ACTIVE,
        trialPlanId: null,
        trialEndsAt: null,
      },
    });
    await entitlements.setTenantOverride(
      tenantId,
      "eta_receipts",
      true,
      "ops promo",
      "platform",
      new Date(Date.now() - 60_000),
    );
    await assert.rejects(() => entitlements.requireEntitlement(tenantId, "eta_receipts"));
    await entitlements.setTenantOverride(tenantId, "eta_receipts", true, "ops promo", "platform", null);
    await entitlements.requireEntitlement(tenantId, "eta_receipts");
  });

  it("blocks 2nd clinician on Lite", async () => {
    await prisma.subscription.update({
      where: { tenantId },
      data: { clinicianSeats: 2 },
    });
    await assert.rejects(
      () => entitlements.assertWithinLimit(tenantId, "max_clinicians", 3),
      (err: unknown) => {
        assert.ok(err instanceof PlanUpgradeRequiredException);
        return true;
      },
    );
  });

  it("blocks 6th clinician when subscription has 5 seats (Clinic billing)", async () => {
    const clinic = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.CLINIC } });
    await prisma.subscription.update({
      where: { tenantId },
      data: { planId: clinic.id, clinicianSeats: 5 },
    });
    await assert.rejects(() => entitlements.assertWithinLimit(tenantId, "max_clinicians", 6));
  });
});

function entitlementTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return false;
}