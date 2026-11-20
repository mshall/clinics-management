import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { KiorlyInvoiceStatus, PlanKey, PrismaClient, TenantStatus, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { CohortService } from "../cohorts/cohort.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { ReferralAttributionService } from "../growth/referral-attribution.service";
import { ReferralCodeService } from "../growth/referral-code.service";
import { legalAcceptancesPayload, requiredLegalForSignup } from "../legal/legal-catalog";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import type { MarketProvisionService } from "../markets/market-provision.service";
import { MarketsService } from "../markets/markets.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SignupProvisionService } from "../signup/signup-provision.service";
import { AuthService } from "../auth/auth.service";
import { SalesRepsService } from "./sales-reps.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;
const DEV_CODE = "424242";

function services() {
  const audit = new AuditService(ps);
  const legal = new LegalAcceptanceService(ps, audit);
  const markets = new MarketsService(ps, {} as FeatureFlagsService, {} as MarketProvisionService);
  const referralCodes = new ReferralCodeService(ps);
  const provision = new SignupProvisionService(ps, markets, legal, new CohortService(), referralCodes, new ReferralAttributionService(referralCodes));
  return new SalesRepsService(
    ps,
    provision,
    legal,
    new OutboxEventService(ps),
    audit,
    new ConfigService({ SIGNUP_OTP_DEV_CODE: DEV_CODE, APP_WEB_URL: "https://app.test" }),
  );
}

describe("ON-07 field-sales assisted onboarding", () => {
  const suffix = `${Date.now()}`;
  let reps: SalesRepsService;
  let repUser: JwtUser;
  let otherRepUser: JwtUser;
  let marketId: string;
  const tenantIds: string[] = [];
  const repUserIds: string[] = [];
  let prevBypass: string | undefined;

  before(async () => {
    prevBypass = process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = "1";
    await prisma.$connect();
    reps = services();
    marketId = (await prisma.market.findFirstOrThrow({ where: { code: "EG", status: "LIVE" } })).id;
    const superAdmin: JwtUser = { userId: "platform", tenantId: null, email: "sa@x", role: UserRole.PLATFORM_SUPER_ADMIN };
    const a = await reps.createRep(superAdmin, { email: `on07.rep.${suffix}@example.com`, displayName: "Rep A", code: `RA-${suffix.slice(-8)}`, password: "reppass88" });
    const b = await reps.createRep(superAdmin, { email: `on07.repb.${suffix}@example.com`, displayName: "Rep B", code: `RB-${suffix.slice(-8)}` });
    repUserIds.push(a.userId, b.userId);
    repUser = { userId: a.userId, tenantId: null, email: `on07.rep.${suffix}@example.com`, role: UserRole.SALES_REP };
    otherRepUser = { userId: b.userId, tenantId: null, email: `on07.repb.${suffix}@example.com`, role: UserRole.SALES_REP };
  });

  after(async () => {
    for (const id of tenantIds) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.salesRep.deleteMany({ where: { userId: { in: repUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: repUserIds } } });
    await prisma.$disconnect();
    if (prevBypass !== undefined) process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = prevBypass;
    else delete process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
  });

  async function createClinic(tag: string) {
    const created = await reps.createTenant(repUser, {
      phone: `010${suffix.slice(-7)}${tag.length}`,
      marketId,
      specialty: "GENERAL_MEDICINE",
      clinic: { nameEn: `ON07 ${tag} ${suffix}`, city: "Cairo" },
      planKey: PlanKey.PRO,
      owner: { displayName: "Dr Owner", email: `on07.owner.${tag}.${suffix}@example.com` },
    });
    tenantIds.push(created.tenantId);
    return created;
  }

  it("non-reps cannot use the rep console", async () => {
    const owner: JwtUser = { userId: "x", tenantId: "t", email: "o@x", role: UserRole.GROUP_ADMIN, isTenantOwner: true };
    await assert.rejects(() => reps.portfolio(owner), ForbiddenException);
  });

  it("AC: rep-created tenant stays PENDING_OWNER until the owner confirms by OTP", async () => {
    const created = await createClinic("ac");
    assert.equal(created.status, TenantStatus.PENDING_OWNER);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: created.tenantId }, include: { subscription: true } });
    assert.equal(tenant.status, TenantStatus.PENDING_OWNER);
    assert.equal(tenant.ownerConfirmedAt, null);
    assert.equal(tenant.salesRepCode, (await reps.me(repUser)).code);
    assert.equal(tenant.subscription?.salesRepCode, tenant.salesRepCode);

    const owner = await prisma.user.findFirstOrThrow({ where: { tenantId: created.tenantId, isTenantOwner: true } });
    await prisma.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash("ownerpass8", 4) } });
    const auth = new AuthService(ps, new JwtService({ secret: "test" }), new AuditService(ps), {} as never, {} as never, {} as never, {} as never, {} as never);
    await assert.rejects(
      () => auth.login(owner.email, "ownerpass8", undefined),
      (e: unknown) =>
        e instanceof UnauthorizedException && JSON.stringify(e.getResponse()).includes("TENANT_PENDING_OWNER"),
    );

    await assert.rejects(() => reps.importActor(repUser, created.tenantId), ForbiddenException);
    await assert.rejects(
      () => reps.confirmOwner(repUser, created.tenantId, { code: "000000", legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)) }),
      BadRequestException,
    );
    await assert.rejects(() => reps.confirmOwner(otherRepUser, created.tenantId, { code: DEV_CODE }), (e: unknown) => e instanceof Error);
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: created.tenantId } })).status, TenantStatus.PENDING_OWNER);

    await assert.rejects(() => reps.confirmOwner(repUser, created.tenantId, { code: DEV_CODE }), ForbiddenException);

    const confirmed = await reps.confirmOwner(repUser, created.tenantId, {
      code: DEV_CODE,
      legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)),
    });
    assert.equal(confirmed.status, TenantStatus.ACTIVE);
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: created.tenantId } });
    assert.equal(after.status, TenantStatus.ACTIVE);
    assert.ok(after.ownerConfirmedAt);
    assert.ok((await prisma.legalAcceptance.count({ where: { tenantId: created.tenantId, userId: owner.id } })) > 0);
    const welcome = await prisma.outboxEvent.findFirst({ where: { tenantId: created.tenantId, type: "rep.owner_welcome" } });
    assert.ok(welcome);
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: owner.id } }), 1);
    const actor = await reps.importActor(repUser, created.tenantId);
    assert.equal(actor.actingRepUserId, repUser.userId);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: created.tenantId, action: { startsWith: "REP_TENANT_" } } });
    assert.deepEqual(audits.map((a) => a.action).sort(), ["REP_TENANT_CREATED", "REP_TENANT_OWNER_CONFIRMED"]);
  });

  it("portfolio counts signups, pending, activations and paid; commission only on retained clinics", async () => {
    const pending = await createClinic("pend");
    const paid = await createClinic("paid");
    await reps.confirmOwner(repUser, paid.tenantId, { code: DEV_CODE, legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)) });
    await prisma.onboardingProgress.update({ where: { tenantId: paid.tenantId }, data: { activatedAt: new Date() } });
    const old = new Date(Date.now() - 200 * 86_400_000);
    await prisma.tenant.update({ where: { id: paid.tenantId }, data: { createdAt: old } });
    await prisma.subscription.update({ where: { tenantId: paid.tenantId }, data: { status: "ACTIVE" } });
    const now = new Date();
    await prisma.kiorlyInvoice.create({
      data: {
        tenantId: paid.tenantId,
        number: `ON07-${suffix}`,
        status: KiorlyInvoiceStatus.PAID,
        currency: "EGP",
        periodKey: `on07-${suffix}`,
        subtotal: 1000,
        tax: 0,
        total: 1000,
        amountPaid: 1000,
        paidAt: now,
        periodStart: now,
        periodEnd: now,
      },
    });
    const p = await reps.portfolio(repUser);
    const mine = p.clinics.filter((c) => [pending.tenantId, paid.tenantId].includes(c.tenantId));
    assert.equal(mine.length, 2);
    assert.ok(p.totals.signups >= 2);
    assert.ok(p.totals.pendingOwner >= 1);
    assert.equal(mine.find((c) => c.tenantId === paid.tenantId)?.paid, true);
    assert.ok(mine.find((c) => c.tenantId === paid.tenantId)?.activatedAt);

    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const c = await reps.commission(repUser, period);
    const egp = c.lines.find((l) => l.currency === "EGP");
    assert.ok(egp);
    assert.equal(egp.eligibleTotal, 1000);
    assert.equal(egp.commission, (1000 * egp.commissionPercent) / 100);

    const other = await reps.portfolio(otherRepUser);
    assert.equal(other.clinics.length, 0);
  });
});
