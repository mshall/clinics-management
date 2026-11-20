import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  PlanKey,
  PriceMigrationStatus,
  PriceUnit,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlansService } from "./plans.service";
import { PRICE_CHANGE_NOTICE_TOPIC } from "./price-indexation";
import { PriceIndexationService } from "./price-indexation.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const indexation = new PriceIndexationService(prismaSvc, new OutboxEventService(prismaSvc));
const plans = new PlansService(prismaSvc, indexation);
const platformUser = { userId: "sb06-platform", role: "PLATFORM_SUPER_ADMIN", email: "ops@kiorly.test" } as unknown as JwtUser;

const DAY = 86_400_000;

describe("SB-06 price indexation & grandfathering (integration)", () => {
  const suffix = `sb06-${Date.now()}`;
  const cohortKey = suffix;
  let planId: string;
  let marketId: string;
  let v1Id: string;
  let founderTenantId: string;
  let regularTenantId: string;
  const lockUntil = new Date(Date.now() + 2 * 365 * DAY);

  async function seedTenant(name: string, priceLockUntil: Date | null) {
    const tenant = await prisma.tenant.create({
      data: { name, nameAr: name, baseCurrency: "EGP", marketId, deploymentCell: "frankfurt" },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId,
        planPriceId: v1Id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(Date.now() - 10 * DAY),
        currentPeriodEnd: new Date(Date.now() + 20 * DAY),
        cohortKey,
        priceLockUntil,
      },
    });
    return tenant.id;
  }

  before(async () => {
    await prisma.$connect();
    (platformUser as { userId: string }).userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    marketId = market.id;
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    planId = plan.id;
    const v1 = await prisma.planPrice.create({
      data: {
        planId,
        marketId,
        currency: "EGP",
        interval: BillingInterval.MONTHLY,
        unit: PriceUnit.PER_TENANT,
        amount: new Prisma.Decimal("999"),
        cohortKey,
        priceVersion: 1,
        validFrom: new Date(Date.now() - 60 * DAY),
      },
    });
    v1Id = v1.id;
    founderTenantId = await seedTenant(`SB06 founder ${suffix}`, lockUntil);
    regularTenantId = await seedTenant(`SB06 regular ${suffix}`, null);
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [founderTenantId, regularTenantId] } } }).catch(() => undefined);
    await prisma.planPrice.deleteMany({ where: { cohortKey } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const body = {
    currency: "EGP",
    interval: BillingInterval.MONTHLY,
    unit: PriceUnit.PER_TENANT,
    amount: 1199,
    cohortKey,
  };

  it("preview shows tenants affected and MRR delta without publishing", async () => {
    const out = (await plans.createPlanPrice(platformUser, planId, { ...body, marketId, preview: true })) as {
      preview: true;
      impact: { tenantsAffected: number; lockedTenants: number; mrrDelta: string; rows: { tenantId: string; effectiveAt: string }[] };
    };
    assert.equal(out.preview, true);
    assert.equal(out.impact.tenantsAffected, 2);
    assert.equal(out.impact.lockedTenants, 1);
    assert.equal(out.impact.mrrDelta, "400.00");
    const founderRow = out.impact.rows.find((r) => r.tenantId === founderTenantId);
    assert.ok(founderRow && new Date(founderRow.effectiveAt) >= lockUntil);
    assert.equal(await prisma.planPrice.count({ where: { cohortKey } }), 1, "preview does not write a price");
    assert.equal(await prisma.planPriceMigration.count({ where: { tenantId: { in: [founderTenantId, regularTenantId] } } }), 0);
  });

  it("publish schedules moves; regular tenant moves at renewal after notice; founder stays locked (AC)", async () => {
    const published = (await plans.createPlanPrice(platformUser, planId, { ...body, marketId })) as {
      id: string;
      impact: { tenantsAffected: number } | null;
    };
    assert.equal(published.impact?.tenantsAffected, 2);

    const regular = await prisma.planPriceMigration.findFirstOrThrow({ where: { tenantId: regularTenantId } });
    const founder = await prisma.planPriceMigration.findFirstOrThrow({ where: { tenantId: founderTenantId } });
    assert.ok(regular.effectiveAt.getTime() - Date.now() >= 29 * DAY, "at least 30-day notice");
    assert.ok(founder.effectiveAt >= lockUntil, "founder never scheduled before priceLockUntil");
    assert.equal(founder.status, PriceMigrationStatus.SCHEDULED, "founder notice not sent years early");

    assert.ok(regular.noticeDueAt.getTime() <= regular.effectiveAt.getTime() - 30 * DAY);
    await indexation.sendDueNotices(regular.noticeDueAt);
    const noticed = await prisma.planPriceMigration.findUniqueOrThrow({ where: { id: regular.id } });
    assert.equal(noticed.status, PriceMigrationStatus.NOTICE_SENT);
    assert.ok(noticed.noticeSentAt);
    const notice = await prisma.outboxEvent.findFirstOrThrow({
      where: { tenantId: regularTenantId, type: PRICE_CHANGE_NOTICE_TOPIC },
    });
    const payload = notice.payload as { messageEn?: string; messageAr?: string };
    assert.match(payload.messageEn ?? "", /1199\.00/);
    assert.ok((payload.messageAr ?? "").length > 0);

    // Unchanged before effective date.
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: regularTenantId } });
    assert.equal(sub.planPriceId, v1Id);

    const atRenewal = new Date(regular.effectiveAt.getTime() + 60_000);
    const result = await indexation.applyDue(atRenewal);
    assert.ok(result.applied >= 1);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: regularTenantId } });
    assert.equal(sub.planPriceId, published.id);
    const appliedRow = await prisma.planPriceMigration.findUniqueOrThrow({ where: { id: regular.id } });
    assert.equal(appliedRow.status, PriceMigrationStatus.APPLIED);
    assert.ok(appliedRow.consentByContinuingAt, "consent-by-continuing recorded");

    // Even if the founder migration were forced due early, apply refuses until the lock ends.
    await prisma.planPriceMigration.update({
      where: { id: founder.id },
      data: {
        status: PriceMigrationStatus.NOTICE_SENT,
        noticeSentAt: new Date(Date.now() - 40 * DAY),
        effectiveAt: new Date(Date.now() - DAY),
      },
    });
    await indexation.applyDue(new Date());
    const founderSub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: founderTenantId } });
    assert.equal(founderSub.planPriceId, v1Id, "founder keeps grandfathered price before priceLockUntil");
    const rescheduled = await prisma.planPriceMigration.findUniqueOrThrow({ where: { id: founder.id } });
    assert.equal(rescheduled.status, PriceMigrationStatus.SCHEDULED);
    assert.ok(rescheduled.effectiveAt >= lockUntil);
  });

  it("admin report lists who moves when", async () => {
    const report = await indexation.report(platformUser, { status: "SCHEDULED" });
    const row = report.items.find((r) => r.tenantId === founderTenantId);
    assert.ok(row);
    assert.equal(row.fromMonthly, "999.00");
    assert.equal(row.toMonthly, "1199.00");
    assert.ok(new Date(row.effectiveAt) >= lockUntil);
    const applied = await indexation.report(platformUser, { status: "APPLIED" });
    assert.ok(applied.items.some((r) => r.tenantId === regularTenantId));
  });
});
