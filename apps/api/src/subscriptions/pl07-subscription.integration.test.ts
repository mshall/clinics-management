import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, EmploymentType, Gender, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import type { JwtUser } from "../auth/jwt-user";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { legalAcceptancesPayload, requiredLegalForSignup } from "../legal/legal-catalog";
import * as bcrypt from "bcryptjs";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
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
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `PL07 Tenant ${suffix}`,
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "PL07 Clinic",
        nameAr: "عيادة",
        country: "EG",
        city: "Cairo",
        addressEn: "1 Test St",
        addressAr: "1",
        locationUrl: "https://example.com",
        phone: "01000000001",
        email: `pl07-clinic-${suffix}@test.local`,
        licenseNumber: "PL07-LIC",
      },
    });
    clinicId = clinic.id;
    const hash = await bcrypt.hash("test-pass-12", 4);
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `pl07-owner-${suffix}@test.local`,
        passwordHash: hash,
        displayName: "PL07 Owner",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    owner = {
      userId: ownerRow.id,
      tenantId,
      role: ownerRow.role,
      email: ownerRow.email,
      additionalRoles: [],
      isTenantOwner: true,
      sessionId: "test",
    };
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
    await legal.recordMany(tenantId, ownerRow.id, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)));

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `PL07-${suffix}`,
        homeBranchId: clinicId,
        firstNameEn: "Test",
        lastNameEn: "Patient",
        firstNameAr: "Test",
        lastNameAr: "Patient",
        phone: `0109${suffix.slice(-6)}`,
        gender: Gender.F,
        dob: new Date("1990-01-01"),
      },
    });
    await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        clinicianId: physicianIds[1]!,
        patientId: patient.id,
        visitType: "OUTPATIENT",
        status: "DRAFT",
      },
    });
  });

  after(async () => {
    await prisma.encounter.deleteMany({ where: { tenantId } });
    await prisma.patient.deleteMany({ where: { tenantId } });
    await prisma.employee.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.clinic.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("downgrade from Clinic (4 doctors) to Pro (1 seat) makes 3 doctors read-only and keeps encounters", async () => {
    await subs.changePlan(owner, tenantId, {
      planKey: PlanKey.PRO,
      interval: BillingInterval.MONTHLY,
      seats: 1,
      confirm: true,
      timing: "IMMEDIATE",
      activeClinicianUserIds: [physicianIds[0]!],
    });

    const inactive = await prisma.user.findUniqueOrThrow({ where: { id: physicianIds[1]! } });
    assert.equal(inactive.billingSeatActive, false);
    const encounters = await prisma.encounter.count({
      where: { tenantId, clinicianId: physicianIds[1]! },
    });
    assert.equal(encounters, 1);
  });
});