import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ListingStatus, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformGrowthService } from "./platform-growth.service";

const prisma = new PrismaClient();
const growth = new PlatformGrowthService(prisma as unknown as PrismaService);

describe("PA-05 growth analytics", () => {
  let platformUser: JwtUser;

  before(async () => {
    await prisma.$connect();
    const row = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(row);
    platformUser = {
      userId: row.id,
      tenantId: null,
      email: row.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("numbers are reproducible from event tables", async () => {
    const report = await growth.getGrowth(platformUser);

    const signup = await prisma.tenant.count();
    const onboardingStarted = await prisma.onboardingProgress.count();
    const activated = await prisma.onboardingProgress.count({ where: { activatedAt: { not: null } } });
    const paid = await prisma.subscription.count({
      where: {
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.GRACE,
            SubscriptionStatus.READ_ONLY,
          ],
        },
      },
    });
    const liveListings = await prisma.marketplaceListing.count({ where: { status: ListingStatus.LIVE } });

    assert.equal(report.funnel.signup, signup);
    assert.equal(report.funnel.onboardingStarted, onboardingStarted);
    assert.equal(report.funnel.activated, activated);
    assert.equal(report.funnel.paid, paid);
    assert.equal(report.kiorex.liveListings, liveListings);
    assert.ok(Array.isArray(report.retention));
    assert.ok(Array.isArray(report.byRep));
    assert.ok(Array.isArray(report.cohorts));
    assert.equal(typeof report.mrr.amount, "number");
    assert.equal(typeof report.arr.amount, "number");
  });
});
