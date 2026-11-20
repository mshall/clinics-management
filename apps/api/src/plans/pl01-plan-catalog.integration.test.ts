import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  PlanKey,
  PriceUnit,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { ensurePlanCatalog } from "../../prisma/plan-catalog-seed";
import { PlansService } from "./plans.service";
import { PriceIndexationService } from "./price-indexation.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const plansService = new PlansService(
  prisma as unknown as PrismaService,
  new PriceIndexationService(
    prisma as unknown as PrismaService,
    new OutboxEventService(prisma as unknown as PrismaService),
  ),
);

describe("PL-01 plan catalog", () => {
  before(async () => {
    await prisma.$connect();
    await ensurePlanCatalog(prisma);
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("seed creates the 4 Clinic plans (+ 3 non-public Nurse edition plans) and EG Pro / Clinic prices", async () => {
    const count = await prisma.plan.count();
    assert.equal(count, 7);
    assert.equal(await prisma.plan.count({ where: { isPublic: true } }), 3, "Nurse plans are never in the public Clinic catalogue");
    assert.equal(await prisma.planPrice.count({ where: { plan: { key: { in: [PlanKey.NURSE_LITE, PlanKey.NURSE_PRO, PlanKey.NURSE_AGENCY] } } } }), 0, "Nurse prices are PROPOSED / NEEDS_HUMAN: no PlanPrice rows");

    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const clinic = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.CLINIC } });

    const proMonthly = await prisma.planPrice.findFirst({
      where: {
        planId: pro.id,
        marketId: eg.id,
        interval: BillingInterval.MONTHLY,
        unit: PriceUnit.PER_CLINICIAN,
        priceVersion: 1,
      },
    });
    assert.ok(proMonthly);
    assert.equal(proMonthly.amount.toString(), "1299");

    const proAnnual = await prisma.planPrice.findFirst({
      where: {
        planId: pro.id,
        marketId: eg.id,
        interval: BillingInterval.ANNUAL,
        unit: PriceUnit.PER_CLINICIAN,
        priceVersion: 1,
      },
    });
    assert.ok(proAnnual);
    assert.equal(proAnnual.amount.toString(), "999");

    const clinicMonthly = await prisma.planPrice.findFirst({
      where: {
        planId: clinic.id,
        marketId: eg.id,
        interval: BillingInterval.MONTHLY,
        unit: PriceUnit.PER_TENANT,
        priceVersion: 1,
      },
    });
    assert.ok(clinicMonthly);
    assert.equal(clinicMonthly.amount.toString(), "3499");
    assert.equal(clinicMonthly.includedClinicians, 5);
    assert.equal(clinicMonthly.extraClinicianAmount?.toString(), "699");
  });

  it("new price version does not change existing subscription amounts", async () => {
    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const v1 = await prisma.planPrice.findFirstOrThrow({
      where: {
        planId: pro.id,
        marketId: eg.id,
        interval: BillingInterval.MONTHLY,
        unit: PriceUnit.PER_CLINICIAN,
        priceVersion: 1,
      },
    });

    const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    const subBase = {
      planId: pro.id,
      planPriceId: v1.id,
      status: "ACTIVE" as const,
      interval: BillingInterval.MONTHLY,
      clinicianSeats: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      activatedAt: new Date(),
    };
    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...subBase },
      update: subBase,
    });

    const validFrom = new Date("2027-01-01T00:00:00Z");
    await prisma.$transaction(async (tx) => {
      await tx.planPrice.update({
        where: { id: v1.id },
        data: { validTo: validFrom },
      });
      await tx.planPrice.create({
        data: {
          planId: pro.id,
          marketId: eg.id,
          currency: "EGP",
          interval: BillingInterval.MONTHLY,
          unit: PriceUnit.PER_CLINICIAN,
          amount: new Prisma.Decimal("1499"),
          priceVersion: 2,
          validFrom,
        },
      });
    });

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      include: { planPrice: true },
    });
    assert.equal(sub.planPriceId, v1.id);
    assert.ok(sub.planPrice);
    assert.equal(sub.planPrice!.amount.toString(), "1299");
    assert.equal(sub.planPrice!.priceVersion, 1);
  });

  it("public catalog returns EN and AR names and headline entitlements", async () => {
    const body = await plansService.listPublicPlans("EG");
    const pro = body.plans.find((p) => p.key === "PRO");
    assert.ok(pro);
    assert.ok(pro.nameEn.length > 0);
    assert.ok(pro.nameAr.length > 0);
    assert.ok(pro.entitlements.some((e) => e.key === "max_clinicians"));
    assert.equal(body.market.code, "EG");
  });
});