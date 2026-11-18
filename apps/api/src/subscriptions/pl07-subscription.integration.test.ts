import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import type { JwtUser } from "../auth/jwt-user";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { legalAcceptancesPayload, requiredLegalForSignup } from "../legal/legal-catalog";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const billingSeats = new BillingSeatService(prismaSvc);
const subs = new SubscriptionService(prismaSvc, legal, billingSeats);

describe("PL-07 plan changes", () => {
  const suffix = `pl07-${Date.now()}`;
  let tenantId: string;
  let ownerId: string;
  let physicianIds: string[] = [];

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        nameEn: `PL07 ${suffix}`,
        nameAr: `PL07 ${suffix}`,
        marketId: market.id,
      },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Main",
        nameAr: "رئيسي",
        country: "EG",
        city: "Cairo",
        addressEn: "1",
        addressAr: "1",
        phone: "0100",
        email: `pl07-${suffix}@test.local`,
        licenseNumber: "L1",
      },
    });
    const hash = await bcrypt.hash("test-pass-12", 4);
    const owner = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@test.local`,
        passwordHash: hash,
        displayName: "Owner",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    ownerId = owner.id;
    for (let i = 0; i < 4; i++) {
      const u = await prisma.user.create({
        data: {
          tenantId,
          email: `doc${i}-${suffix}@test.local`,
          passwordHash: hash,
          displayName: `Doc ${i}`,
          role: UserRole.PHYSICIAN,
        },
      });
      await prisma.employee.create({
        data: { tenantId, clinicId: clinic.id, userId: u.id, nameEn: u.displayName, nameAr: u.displayName },
      });
      physicianIds.push(u.id);
    }

    const clinicPlan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.CLINIC } });
    const price = await prisma.planPrice.findFirstOrThrow({
      where: { planId: clinicPlan.id, marketId: market.id, interval: BillingInterval.MONTHLY, ...ACTIVE_PRICE_WHERE() },
    });
    const now = new Date();
    const end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1);
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: clinicPlan.id,
        planPriceId: price.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 4,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    await legal.recordMany(tenantId, ownerId, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)));
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const ownerUser = (): JwtUser => ({
    userId: ownerId,
    tenantId,
    role: UserRole.GROUP_ADMIN,
    email: `owner-${suffix}@test.local`,
    additionalRoles: [],
    isTenantOwner: true,
    sessionId: "test",
  });

  it("downgrade Clinic (4 doctors) to Pro (1 seat) makes 3 doctors read-only", async () => {
    const preview = await subs.previewPlanChange(ownerUser(), tenantId, {
      planKey: PlanKey.PRO,
      interval: BillingInterval.MONTHLY,
      seats: 1,
      timing: "IMMEDIATE",
    });
    assert.ok(preview.requiresClinicianSelection);

    await subs.changePlan(ownerUser(), tenantId, {
      planKey: PlanKey.PRO,
      interval: BillingInterval.MONTHLY,
      seats: 1,
      confirm: true,
      timing: "IMMEDIATE",
      activeClinicianUserIds: [physicianIds[0]!],
    });

    const users = await prisma.user.findMany({
      where: { id: { in: physicianIds } },
      select: { id: true, billingSeatActive: true },
    });
    const active = users.filter((u) => u.billingSeatActive);
    assert.equal(active.length, 1);
    assert.equal(active[0]!.id, physicianIds[0]);

    const encounters = await prisma.encounter.count({ where: { tenantId, clinicianId: { in: physicianIds } } });
    assert.equal(encounters, 0);
    const encounter = await prisma.encounter.create({
      data: {
        tenantId,
        clinicId: (await prisma.clinic.findFirstOrThrow({ where: { tenantId } })).id,
        clinicianId: physicianIds[1]!,
        patientId: (
          await prisma.patient.create({
            data: {
              tenantId,
              homeBranchId: (await prisma.clinic.findFirstOrThrow({ where: { tenantId } })).id,
              firstNameEn: "P",
              lastNameEn: "T",
              firstNameAr: "P",
              lastNameAr: "T",
              gender: "FEMALE",
              dateOfBirth: new Date("1990-01-01"),
              phone: "010999",
            },
          })
        ).id,
        status: "DRAFT",
      },
    });
    assert.ok(encounter.id);
  });
});