import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  KiorlyInvoiceStatus,
  KiorlyLineType,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { AuditService } from "../audit/audit.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { DunningService } from "./dunning.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { subscriptionAllowsAction, SubscriptionAccessAction } from "./subscription-access-policy";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const billingSeats = new BillingSeatService(prismaSvc);
const subs = new SubscriptionService(prismaSvc, legal, billingSeats);
const listings = new MarketplaceListingService(prismaSvc, new OutboxEventService(prismaSvc));
const renewal = new SubscriptionRenewalService(prismaSvc, subs, billingSeats, listings, legal);
const dunning = new DunningService(prismaSvc, subs, listings, renewal);

describe("SB-03 dunning integration", () => {
  const suffix = `sb03-${Date.now()}`;

  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant(planKey: PlanKey = PlanKey.PRO) {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Dunning ${suffix}`,
        nameAr: `Dunning ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return tenant;
  }

  it("legacy mode (lapseAction READ_ONLY_SUSPEND): escalates to READ_ONLY on day +15 and reactivates when invoice paid", async () => {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const fd = (market.featureDefaults ?? {}) as Record<string, any>;
    const prevFd = JSON.parse(JSON.stringify(fd));
    fd.kiorlyBilling = { ...(fd.kiorlyBilling ?? {}), subscription: { lapseAction: "READ_ONLY_SUSPEND" } };
    await prisma.market.update({ where: { id: market.id }, data: { featureDefaults: fd } });
    try {
      await legacyReadOnlyFlow();
    } finally {
      await prisma.market.update({ where: { id: market.id }, data: { featureDefaults: prevFd } });
    }
  });

  async function legacyReadOnlyFlow() {
    const tenant = await seedTenant();
    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() - 15);
    await prisma.kiorlyInvoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-${suffix}`,
        periodKey: `p-${suffix}`,
        periodStart: new Date(dueAt.getTime() - 30 * 86_400_000),
        periodEnd: new Date(dueAt.getTime() - 1 * 86_400_000),
        currency: "EGP",
        status: KiorlyInvoiceStatus.ISSUED,
        dueAt,
        issuedAt: new Date(dueAt.getTime() - 7 * 86_400_000),
        total: 999,
        subtotal: 999,
        tax: 0,
        amountPaid: 0,
        lines: {
          create: {
            type: KiorlyLineType.SUBSCRIPTION,
            descEn: "Pro",
            descAr: "برو",
            quantity: 1,
            unitAmount: 999,
            amount: 999,
          },
        },
      },
    });

    await dunning.runForTenant(tenant.id, new Date());
    const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(after.status, SubscriptionStatus.READ_ONLY);

    await prisma.kiorlyInvoice.updateMany({
      where: { tenantId: tenant.id },
      data: { status: KiorlyInvoiceStatus.PAID, amountPaid: 999, paidAt: new Date() },
    });
    await dunning.reconcileAfterPayment(tenant.id);
    const reactivated = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(reactivated.status, SubscriptionStatus.ACTIVE);
  }

  it("READ_ONLY blocks scheduling but allows export policy", () => {
    assert.equal(subscriptionAllowsAction(SubscriptionStatus.READ_ONLY, SubscriptionAccessAction.SCHEDULING_WRITE), false);
    assert.equal(subscriptionAllowsAction(SubscriptionStatus.READ_ONLY, SubscriptionAccessAction.EXPORT), true);
  });
});