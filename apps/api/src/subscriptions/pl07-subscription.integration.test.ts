import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, EmploymentType, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
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

describe("PL-07 downgrade seat cap", () => {
  let tenantId: string;
  let owner: JwtUser;
  const physicianIds: string[] = [];
  let clinicId: string;
  const suffix = `pl07-${Date.now()}`;

  before(async () => {
    process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = "1";
    await prisma.$connect();
    const seedClinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = seedClinic.tenantId;
    clinicId = seedClinic.id;
    const ownerRow = await prisma.user.findFirstOrThrow({
      where: { tenantId, isTenantOwner: true },
    });
    owner = {
      userId: ownerRow.id,
      tenantId,
      role: ownerRow.role,
      email: ownerRow.email,
      additionalRoles: ownerRow.additionalRoles,
      isTenantOwner: true,
      sessionId: "test",
    };
    const hash = ownerRow.passwordHash;
    for (let i = 0; i < 3; i++) {
      const email = `pl07-doc-${suffix}-${i}@test.local`;
      const u = await prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash: hash,
          displayName: `PL07 Doc ${i}`,
          role: UserRole.PHYSICIAN,
          billingSeatActive: true,
        },
      });
      await prisma.employee.create({
        data: {
          tenantId,
          clinicId,
          userId: u.id,
          employeeNumber: `PL07-${suffix}-${i}`,
          firstNameEn: "PL07",
          lastNameEn: `Doc${i}`,
          phone: "0100000000",
          jobTitle: "Physician",
          employmentType: EmploymentType.FULL_TIME,
          hireDate: new Date(),
          salaryBase: 0,
          email: u.email,
        },
      });
      physicianIds.push(u.id);
    }

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const clinicPlan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.CLINIC } });
    const price = await prisma.planPrice.findFirstOrThrow({
      where: { planId: clinicPlan.id, marketId: market.id, interval: BillingInterval.MONTHLY, ...ACTIVE_PRICE_WHERE() },
    });
    const now = new Date();
    const end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1);
    await prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: clinicPlan.id,
        planPriceId: price.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 4,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
      update: {
        planId: clinicPlan.id,
        planPriceId: price.id,
        status: SubscriptionStatus.ACTIVE,
        clinicianSeats: 4,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    await legal.recordMany(tenantId, ownerRow.id, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)));
  });

  after(async () => {
    await prisma.encounter.deleteMany({ where: { clinicianId: { in: physicianIds } } });
    await prisma.employee.deleteMany({ where: { userId: { in: physicianIds } } });
    await prisma.user.deleteMany({ where: { id: { in: physicianIds } } });
    await prisma.$disconnect();
  });

  it("downgrade from Clinic (4 doctors) to Pro (1 seat) makes 3 doctors read-only and keeps encounters", async () => {
    const patient = await prisma.patient.findFirstOrThrow({ where: { tenantId, deletedAt: null } });
    const inactiveId = physicianIds[1]!;
    const encounter = await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: inactiveId,
        patientId: patient.id,
        visitType: "OUTPATIENT",
        status: "DRAFT",
      },
    });

    await subs.changePlan(owner, tenantId, {
      planKey: PlanKey.PRO,
      interval: BillingInterval.MONTHLY,
      seats: 1,
      confirm: true,
      timing: "IMMEDIATE",
      activeClinicianUserIds: [physicianIds[0]!],
    });

    const inactive = await prisma.user.findUniqueOrThrow({ where: { id: inactiveId } });
    assert.equal(inactive.billingSeatActive, false);
    const stillThere = await prisma.encounter.findUniqueOrThrow({ where: { id: encounter.id } });
    assert.equal(stillThere.clinicianId, inactiveId);
  });
});