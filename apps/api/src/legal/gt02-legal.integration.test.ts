import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { BillingInterval, PlanKey, PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { MarketsService } from "../markets/markets.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { MarketProvisionService } from "../markets/market-provision.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignupProvisionService } from "../signup/signup-provision.service";
import { LegalAcceptanceService } from "./legal-acceptance.service";
import { legalAcceptancesPayload, requiredLegalForSignup } from "./legal-catalog";
import { SubscriptionService } from "../subscriptions/subscription.service";
import type { JwtUser } from "../auth/jwt-user";

const prisma = new PrismaClient();

function services() {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const legal = new LegalAcceptanceService(prismaSvc, audit);
  const markets = new MarketsService(prismaSvc, {} as FeatureFlagsService, {} as MarketProvisionService);
  const provision = new SignupProvisionService(prismaSvc, markets, legal);
  const subs = new SubscriptionService(prismaSvc, legal);
  return { legal, provision, subs };
}

describe("GT-02 legal acceptance", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("blocks PRO signup without legal acceptances", async () => {
    const { provision } = services();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG", status: "LIVE" } });
    const suffix = `${Date.now()}`;
    const email = `gt02.nlegal.${suffix}@example.com`;
    await assert.rejects(
      () =>
        provision.provision({
          phone: `2012${String(suffix).slice(-8)}`,
          marketId: market.id,
          profile: { displayName: "GT02", email, password: "demopass8" },
          specialty: "GENERAL_MEDICINE",
          clinic: { nameEn: `GT02 ${suffix}`, city: "Cairo" },
          planKey: PlanKey.PRO,
        }),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });

  it("provisions PRO signup when current legal pack is accepted", async () => {
    const { provision } = services();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG", status: "LIVE" } });
    const suffix = `${Date.now()}`;
    const email = `gt02.legal.${suffix}@example.com`;
    const created = await provision.provision({
      phone: `2013${String(suffix).slice(-8)}`,
      marketId: market.id,
      profile: { displayName: "GT02 Paid", email, password: "demopass8" },
      specialty: "GENERAL_MEDICINE",
      clinic: { nameEn: `GT02 Legal ${suffix}`, city: "Cairo" },
      planKey: PlanKey.PRO,
      legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)),
    });
    const count = await prisma.legalAcceptance.count({
      where: { tenantId: created.tenantId, userId: created.userId },
    });
    assert.ok(count >= requiredLegalForSignup(PlanKey.PRO).length);
    await prisma.tenant.delete({ where: { id: created.tenantId } });
  });

  it("blocks paid plan change without current legal acceptances", async () => {
    const { subs, legal } = services();
    const owner = await prisma.user.findFirstOrThrow({
      where: { isTenantOwner: true, tenantId: { not: null } },
    });
    const tenantId = owner.tenantId!;
    await prisma.legalAcceptance.deleteMany({ where: { userId: owner.id, tenantId } });
    const jwt: JwtUser = {
      userId: owner.id,
      tenantId,
      email: owner.email,
      role: owner.role,
      isTenantOwner: true,
    };
    await assert.rejects(
      () =>
        subs.changePlan(jwt, tenantId, {
          planKey: PlanKey.PRO,
          interval: BillingInterval.MONTHLY,
          seats: 1,
          confirm: true,
        }),
      (e: unknown) => e instanceof ForbiddenException,
    );
    await legal.recordMany(tenantId, owner.id, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)));
    const preview = await subs.changePlan(jwt, tenantId, {
      planKey: PlanKey.PRO,
      interval: BillingInterval.MONTHLY,
      seats: 1,
      confirm: true,
    });
    assert.equal((preview as { applied?: boolean }).applied, true);
  });
});