import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { ensurePlanEntitlements } from "../../prisma/plans.seed";
import { PlanUpgradeRequiredException } from "./plan-upgrade-required.exception";
import { EntitlementsService } from "./entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const entitlements = new EntitlementsService(prisma as unknown as PrismaService);

describe("PL-04 module entitlements", () => {
  let tenantId: string;

  before(async () => {
    await prisma.$connect();
    await ensurePlanEntitlements(prisma);
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = tenant.id;
    await prisma.subscription.update({
      where: { tenantId },
      data: { planId: lite.id, status: SubscriptionStatus.ACTIVE, trialPlanId: null },
    });
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("Lite is not entitled to mod_hr or mod_operations", async () => {
    const resolved = await entitlements.resolve(tenantId);
    assert.equal(resolved.plan.key, PlanKey.LITE);
    assert.equal(resolved.entitlements.mod_hr, false);
    assert.equal(resolved.entitlements.mod_operations, false);
    await assert.rejects(() => entitlements.requireEntitlement(tenantId, "mod_hr"), (e: unknown) => {
      assert.ok(e instanceof PlanUpgradeRequiredException);
      return true;
    });
    await assert.rejects(() => entitlements.requireEntitlement(tenantId, "mod_operations"));
  });

  it("Pro plan seed includes whatsapp_reminders and card_payments", async () => {
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const rows = await prisma.planEntitlement.findMany({ where: { planId: pro.id } });
    const keys = new Set(rows.map((r) => r.key));
    assert.ok(keys.has("whatsapp_reminders"));
    assert.ok(keys.has("card_payments"));
    assert.ok(keys.has("mod_clinical"));
  });
});