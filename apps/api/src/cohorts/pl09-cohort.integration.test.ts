import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, PlanKey, SubscriptionStatus } from "@prisma/client";
import { CohortService } from "./cohort.service";
import { PrismaClient } from "@prisma/client";
import { FOUNDING_EG_COHORT_KEY } from "../../prisma/founding-cohort-seed";

const prisma = new PrismaClient();
const cohorts = new CohortService();

describe("PL-09 founding cohort", () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("never exceeds cap under concurrent assignment", async () => {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const testKey = `TEST_COHORT_${Date.now()}`;
    await prisma.cohort.create({
      data: {
        key: testKey,
        marketId: market.id,
        cap: 5,
        assignedCount: 0,
        opensAt: new Date("2020-01-01"),
        priceLockMonths: 24,
      },
    });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const price = await prisma.planPrice.findFirst({
      where: { planId: plan.id, marketId: market.id, interval: BillingInterval.MONTHLY, validTo: null },
    });

    const attempts = 12;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: `Cohort test ${i}`,
              marketId: market.id,
              deploymentCell: market.hostCell,
              baseCurrency: "EGP",
              defaultVisitFee: 300,
            },
          });
          const now = new Date();
          const sub = await tx.subscription.create({
            data: {
              tenantId: tenant.id,
              planId: plan.id,
              planPriceId: price?.id ?? null,
              status: SubscriptionStatus.TRIALING,
              interval: BillingInterval.MONTHLY,
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
              trialStartsAt: now,
              trialEndsAt: new Date(now.getTime() + 90 * 86_400_000),
            },
          });
          return cohorts.tryAssignFounding(tx, {
            marketId: market.id,
            subscriptionId: sub.id,
            cohortKey: testKey,
          });
        }),
      ),
    );
    const assigned = results.filter((r) => r.assigned).length;
    assert.equal(assigned, 5);
    const row = await prisma.cohort.findUniqueOrThrow({ where: { key: testKey } });
    assert.equal(row.assignedCount, 5);
    await prisma.cohort.delete({ where: { key: testKey } });
  });

  it("public founding cohort key is seeded", async () => {
    const row = await prisma.cohort.findUnique({ where: { key: FOUNDING_EG_COHORT_KEY } });
    assert.ok(row);
    assert.equal(row!.cap, 500);
  });
});