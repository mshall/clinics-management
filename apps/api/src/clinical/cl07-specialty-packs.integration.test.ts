import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { SpecialtyPacksService } from "./specialty-packs.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CL-07 specialty pack add-ons", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let userId: string;
  let patientId: string;
  let svc: SpecialtyPacksService;
  let entitlements: EntitlementsService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    tenantId = (
      await prisma.tenant.create({
        data: { name: `CL07 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" },
      })
    ).id;
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `cl07.${suffix}@example.com`,
          passwordHash: "x",
          displayName: "Owner",
          role: UserRole.CLINIC_ADMIN,
          isTenantOwner: true,
        },
      })
    ).id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "CL07",
        nameAr: "م",
        country: "EG",
        city: "Cairo",
        addressEn: "a",
        addressAr: "ا",
        locationUrl: "https://maps.example/cl07",
        timezone: "Africa/Cairo",
        phone: "201000000507",
        email: `cl07c.${suffix}@example.com`,
        licenseNumber: `EG-CL07-${suffix}`,
        defaultCurrency: "EGP",
      },
    });
    patientId = (
      await prisma.patient.create({
        data: {
          tenantId,
          mrn: `CL07-${suffix}`,
          firstNameEn: "D",
          lastNameEn: "P",
          gender: "M",
          phone: `2013${suffix.slice(-8)}`,
          homeBranchId: clinic.id,
        },
      })
    ).id;
    const prismaSvc = prisma as unknown as PrismaService;
    entitlements = new EntitlementsService(prismaSvc);
    svc = new SpecialtyPacksService(prismaSvc, entitlements);
  });

  after(async () => {
    if (tenantId) {
      await prisma.dentalChartTooth.deleteMany({ where: { tenantId } });
      await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("purchasing pack_dental / pack_aesthetics enables the entitlement add-on", async () => {
    assert.equal(await entitlements.isEntitled(tenantId, "pack_dental"), false);
    const bought = await svc.purchaseAddon(tenantId, userId, "pack_dental");
    assert.equal(bought.enabled, true);
    assert.equal(await entitlements.isEntitled(tenantId, "pack_dental"), true);

    await svc.purchaseAddon(tenantId, userId, "pack_aesthetics");
    assert.equal(await entitlements.isEntitled(tenantId, "pack_aesthetics"), true);

    const tooth = await svc.upsertDentalTooth(tenantId, patientId, {
      toothFdi: 16,
      status: "CARIES",
      planNote: "Fill",
      feeAmount: 500,
    });
    assert.equal(tooth.toothFdi, 16);
    const chart = await svc.getDentalChart(tenantId, patientId);
    assert.equal(chart.length, 1);
  });
});
