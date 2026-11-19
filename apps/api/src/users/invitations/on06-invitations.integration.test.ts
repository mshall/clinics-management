import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../../audit/audit.service";
import type { JwtUser } from "../../auth/jwt-user";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import { PlanUpgradeRequiredException } from "../../entitlements/plan-upgrade-required.exception";
import { OutboxEventService } from "../../messaging/outbox-event.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { InvitationsService } from "./invitations.service";

// Nest's ConfigService prefers process.env over the injected map: isolate from a developer's local APP_WEB_URL.
delete process.env.APP_WEB_URL;

const prisma = new PrismaClient();
const ps = prisma as unknown as PrismaService;
const invitations = new InvitationsService(
  ps,
  new EntitlementsService(ps),
  new OutboxEventService(ps),
  new AuditService(ps),
  new ConfigService({ APP_WEB_URL: "https://app.test" }),
);

function tokenFrom(url: string): string {
  return decodeURIComponent(url.split("/invite/")[1]!);
}

describe("ON-06 staff invitations", () => {
  let tenantId: string;
  let owner: JwtUser;
  const suffix = `${Date.now()}`;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Invite ${suffix}`,
        nameAr: "عيادة الدعوة",
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: {
            nameEn: "Main",
            nameAr: "الرئيسي",
            country: "EG",
            city: "Cairo",
            addressEn: "Street",
            addressAr: "شارع",
            locationUrl: "https://maps.example/inv",
            phone: "201000000003",
            email: `on06.${suffix}@example.com`,
            licenseNumber: "L-6",
            defaultCurrency: "EGP",
          },
        },
      },
    });
    tenantId = tenant.id;
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `owner.on06.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Dr Owner",
        role: UserRole.PHYSICIAN,
        isTenantOwner: true,
      },
    });
    owner = { userId: ownerRow.id, tenantId, email: ownerRow.email, role: ownerRow.role, isTenantOwner: true };
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: lite.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      },
    });
  });

  after(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("invitation beyond the seat limit returns 402 with an upgrade path", async () => {
    await assert.rejects(
      () => invitations.create(owner, tenantId, { phoneOrEmail: `doc2.${suffix}@example.com`, roles: [UserRole.PHYSICIAN] }),
      (err: unknown) => {
        assert.ok(err instanceof PlanUpgradeRequiredException);
        assert.equal(err.getStatus(), 402);
        const body = err.getResponse() as { code: string; entitlement: string; requiredPlan: string };
        assert.equal(body.code, "PLAN_UPGRADE_REQUIRED");
        assert.equal(body.entitlement, "max_clinicians");
        assert.ok(body.requiredPlan);
        return true;
      },
    );
  });

  it("WhatsApp invite → outbox message, accept sets password and creates the user with roles", async () => {
    const inv = await invitations.create(owner, tenantId, {
      phoneOrEmail: "01001112233",
      roles: [UserRole.RECEPTIONIST],
      displayName: "Sara",
    });
    assert.equal(inv.channel, "WHATSAPP");
    assert.equal(inv.phoneOrEmail, "+201001112233");
    assert.equal(inv.status, "PENDING");
    assert.ok(inv.acceptUrl?.startsWith("https://app.test/invite/"));
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId, aggregateId: inv.id, type: "staff.invitation" } });
    const payload = ev.payload as { toPhone: string; textAr: string; acceptUrl: string };
    assert.equal(ev.target, "INTERNAL");
    assert.equal(payload.toPhone, "+201001112233");
    assert.match(payload.textAr, /كيورلي/);

    const token = tokenFrom(inv.acceptUrl!);
    const view = await invitations.publicView(token);
    assert.deepEqual(view.roles, [UserRole.RECEPTIONIST]);
    await assert.rejects(() => invitations.accept(token, { password: "longpassword" }), /email/i);
    const res = await invitations.accept(token, { password: "longpassword", email: `sara.${suffix}@example.com` });
    assert.equal(res.ok, true);
    const user = await prisma.user.findFirstOrThrow({ where: { tenantId, email: `sara.${suffix}@example.com` } });
    assert.equal(user.role, UserRole.RECEPTIONIST);
    assert.ok(await bcrypt.compare("longpassword", user.passwordHash));
    await assert.rejects(() => invitations.accept(token, { password: "longpassword", email: `x.${suffix}@example.com` }), /accepted/i);
  });

  it("resend rotates the link; revoke blocks acceptance; expired links are refused", async () => {
    const inv = await invitations.create(owner, tenantId, { phoneOrEmail: `nurse.${suffix}@example.com`, roles: [UserRole.NURSE] });
    assert.equal(inv.channel, "EMAIL");
    const resent = await invitations.resend(owner, tenantId, inv.id);
    assert.equal(resent.sendCount, 2);
    await assert.rejects(() => invitations.publicView(tokenFrom(inv.acceptUrl!)), /not found/i);
    await invitations.revoke(owner, tenantId, inv.id);
    await assert.rejects(() => invitations.accept(tokenFrom(resent.acceptUrl!), { password: "longpassword" }), /revoked/i);

    const inv2 = await invitations.create(owner, tenantId, { phoneOrEmail: `asst.${suffix}@example.com`, roles: [UserRole.CLINIC_ASSISTANT] });
    await prisma.invitation.update({ where: { id: inv2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => invitations.accept(tokenFrom(inv2.acceptUrl!), { password: "longpassword" }), /expired/i);
  });

  it("pending invitations count against seats", async () => {
    await prisma.subscription.update({ where: { tenantId }, data: { clinicianSeats: 2 } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    await prisma.subscription.update({ where: { tenantId }, data: { planId: pro.id } });
    await invitations.create(owner, tenantId, { phoneOrEmail: `doc3.${suffix}@example.com`, roles: [UserRole.PHYSICIAN] });
    await assert.rejects(
      () => invitations.create(owner, tenantId, { phoneOrEmail: `doc4.${suffix}@example.com`, roles: [UserRole.PHYSICIAN] }),
      PlanUpgradeRequiredException,
    );
  });

  it("only owners/admins can invite", async () => {
    const recep: JwtUser = { userId: owner.userId, tenantId, email: "r@x.com", role: UserRole.RECEPTIONIST };
    await assert.rejects(() => invitations.create(recep, tenantId, { phoneOrEmail: "a@b.com", roles: [UserRole.NURSE] }), /owner or an admin/);
  });
});
