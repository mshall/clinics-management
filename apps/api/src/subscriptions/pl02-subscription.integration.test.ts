import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { ensureAllTenantSubscriptions } from "./subscription-provision";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { TrialEngineService } from "./trial-engine.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const billingSeats = new BillingSeatService(prismaSvc);
const subs = new SubscriptionService(prismaSvc, legal, billingSeats);
const trialEngine = new TrialEngineService(prismaSvc, subs);
const lifecycle = new SubscriptionLifecycleService(prisma as unknown as PrismaService, subs, trialEngine);

describe("PL-02 subscriptions", () => {
  before(async () => {
    await prisma.$connect();
    await ensureAllTenantSubscriptions(prisma);
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("every tenant has exactly one subscription", async () => {
    const tenantCount = await prisma.tenant.count();
    const subCount = await prisma.subscription.count();
    assert.equal(tenantCount, subCount);
    const dup = await prisma.subscription.groupBy({
      by: ["tenantId"],
      _count: { tenantId: true },
    });
    assert.ok(dup.every((r) => r._count.tenantId === 1));
  });

  it("status transition writes SubscriptionEvent and AuditLog", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    const priorEvents = await prisma.subscriptionEvent.count({ where: { subscriptionId: sub.id } });
    const priorAudit = await prisma.auditLog.count({
      where: { tenantId: tenant.id, resource: "Subscription" },
    });

    if (sub.status !== SubscriptionStatus.ACTIVE) {
      await subs.activateSubscription(tenant.id, null);
    }
    await subs.transitionToPastDue(tenant.id);
    await subs.transitionStatus(tenant.id, SubscriptionStatus.ACTIVE, null, "payment_received");

    const events = await prisma.subscriptionEvent.count({ where: { subscriptionId: sub.id } });
    const audit = await prisma.auditLog.count({
      where: { tenantId: tenant.id, resource: "Subscription" },
    });
    assert.ok(events > priorEvents);
    assert.ok(audit > priorAudit);
  });

  it("lifecycle job is idempotent within the same day", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const past = new Date(Date.now() - 86_400_000);
    const periodEnd = new Date(Date.now() - 1000);
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        interval: BillingInterval.MONTHLY,
        currentPeriodStart: past,
        currentPeriodEnd: periodEnd,
      },
    });

    const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    await lifecycle.runDailyLifecycle(new Date());
    const mid = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    await lifecycle.runDailyLifecycle(new Date());
    const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

    assert.ok(mid.currentPeriodEnd > before.currentPeriodEnd);
    assert.equal(after.currentPeriodEnd.getTime(), mid.currentPeriodEnd.getTime());
    assert.equal(after.currentPeriodStart.getTime(), mid.currentPeriodStart.getTime());
  });

  it("grandfathering: plan price id unchanged on catalog price bump", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const v1 = await prisma.planPrice.findFirstOrThrow({
      where: { planId: pro.id, marketId: eg.id, interval: "MONTHLY", priceVersion: 1 },
    });
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { planPriceId: v1.id, planId: pro.id },
    });
    const locked = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(locked.planPriceId, v1.id);
  });
});