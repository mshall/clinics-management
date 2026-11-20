import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CreditReason, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PlatformAdminService } from "./platform-admin.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { BillingSeatService } from "../subscriptions/billing-seat.service";
import { SubscriptionService } from "../subscriptions/subscription.service";
import { TrialEngineService } from "../subscriptions/trial-engine.service";
import { ForbiddenException } from "@nestjs/common";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const billingSeats = new BillingSeatService(prismaSvc);
const subs = new SubscriptionService(prismaSvc, legal, billingSeats);
const trialEngine = new TrialEngineService(prismaSvc, subs);
const creditWallet = new CreditWalletService(prismaSvc);
const entitlements = new EntitlementsService(prismaSvc);

function platformSvc(): PlatformAdminService {
  return new PlatformAdminService(
    prismaSvc,
    null as never,
    null as never,
    null as never,
    entitlements,
    trialEngine,
    creditWallet,
    null as never,
    billingSeats,
  );
}

describe("PA-01 tenant lifecycle console", () => {
  const suffix = `pa01-${Date.now()}`;
  let platformUser: JwtUser;
  let clinicOwner: JwtUser;
  let tenantId: string;

  before(async () => {
    await prisma.$connect();
    const row = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(row, "seed platform super admin required");
    platformUser = {
      userId: row.id,
      tenantId: null,
      email: row.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Lifecycle ${suffix}`,
        nameAr: `Lifecycle ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
        salesRepCode: "REP-PA01",
      },
    });
    tenantId = tenant.id;
    const start = new Date();
    const trialEnds = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: pro.id,
        status: SubscriptionStatus.TRIALING,
        clinicianSeats: 2,
        currentPeriodStart: start,
        currentPeriodEnd: trialEnds,
        trialEndsAt: trialEnds,
      },
    });
    await prisma.onboardingProgress.create({
      data: {
        tenantId: tenant.id,
        stepsJson: {
          clinic: { status: "done" },
          team: { status: "done" },
          first_visit: { status: "pending" },
        },
      },
    });

    const owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `owner-${suffix}@example.com`,
        passwordHash: "x",
        displayName: "Owner PA01",
        role: UserRole.GROUP_ADMIN,
      },
    });
    clinicOwner = {
      userId: owner.id,
      tenantId: tenant.id,
      email: owner.email,
      role: UserRole.GROUP_ADMIN,
    };
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("rejects non-platform users on lifecycle read and mutations", async () => {
    const svc = platformSvc();
    await assert.rejects(async () => svc.getTenant(clinicOwner, tenantId), (e) => e instanceof ForbiddenException);
    assert.throws(
      () => svc.extendTenantTrial(clinicOwner, tenantId, { days: 1, reason: "nope" }),
      (e) => e instanceof ForbiddenException,
    );
    await assert.rejects(
      async () =>
        svc.grantTenantCredits(clinicOwner, tenantId, {
          amount: 1,
          reason: CreditReason.GOODWILL,
          note: "nope",
        }),
      (e) => e instanceof ForbiddenException,
    );
    await assert.rejects(
      async () =>
        svc.putTenantEntitlementOverride(clinicOwner, tenantId, "kiorex", {
          valueJson: true,
          reason: "nope",
        }),
      (e) => e instanceof ForbiddenException,
    );
  });

  it("returns tabbed lifecycle payload and audits platform actions", async () => {
    const svc = platformSvc();
    const before = await svc.getTenant(platformUser, tenantId);
    assert.equal(before.id, tenantId);
    assert.ok(before.subscription);
    assert.equal(before.subscription?.status, SubscriptionStatus.TRIALING);
    assert.ok(before.activationScore >= 0 && before.activationScore <= 100);
    assert.equal(before.salesRepCode, "REP-PA01");
    assert.ok(Array.isArray(before.events));
    assert.ok(Array.isArray(before.invoices));
    assert.ok(Array.isArray(before.kiorexListings));
    assert.ok(Array.isArray(before.verifications));
    assert.ok(Array.isArray(before.entitlementOverrides));

    await svc.extendTenantTrial(platformUser, tenantId, { days: 3, reason: "PA-01 extend" });
    await svc.grantTenantCredits(platformUser, tenantId, {
      amount: 5,
      reason: CreditReason.GOODWILL,
      note: "PA-01 grant",
    });
    const overrideKey = `pa01_${suffix}`;
    await svc.putTenantEntitlementOverride(platformUser, tenantId, overrideKey, {
      valueJson: true,
      reason: "PA-01 override",
    });

    const after = await svc.getTenant(platformUser, tenantId);
    assert.ok(after.entitlementOverrides.some((o) => o.key === overrideKey));
    assert.ok(after.events.some((e) => e.action === "subscription.trial_extended"));
    assert.ok(after.events.some((e) => e.action === "credit.grant"));
    assert.ok(after.events.some((e) => e.action === "entitlement.override_set"));
    assert.ok(Number(after.wallet.balance) >= 5);
  });
});
