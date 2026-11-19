import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  Gender,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { TrialEngineService } from "./trial-engine.service";
import { foundingTrialEndsAt, resolveTrialConfig, standardTrialEndsAt } from "./trial-config";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const billingSeats = new BillingSeatService(prismaSvc);
const subs = new SubscriptionService(prismaSvc, legal, billingSeats);
const trialEngine = new TrialEngineService(prismaSvc, subs);

describe("CR-01 trial engine", () => {
  const suffix = `cr01-${Date.now()}`;

  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTrialTenant(withPatient = false) {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Trial ${suffix}`,
        nameAr: `Trial ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    const start = new Date("2026-01-01T12:00:00.000Z");
    const config = resolveTrialConfig({ marketFeatureDefaults: market.featureDefaults });
    const sub = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: pro.id,
        status: SubscriptionStatus.TRIALING,
        trialStartsAt: start,
        trialEndsAt: foundingTrialEndsAt(start, config),
        trialPlanId: pro.id,
        currentPeriodStart: start,
        currentPeriodEnd: new Date(start.getTime() + 30 * 86_400_000),
      },
    });
    const clinic = await prisma.clinic.create({
      data: {
        tenantId: tenant.id,
        nameEn: "Trial Clinic",
        nameAr: "عيادة",
        country: "EG",
        city: "Cairo",
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/t",
        phone: "201000000099",
        email: `clinic-${suffix}@example.test`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
        openingTime: "09:00",
        closingTime: "17:00",
      },
    });
    const owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `owner-${suffix}@example.test`,
        passwordHash: "x",
        displayName: "Owner",
        role: "PHYSICIAN",
        isTenantOwner: true,
      },
    });
    let patient = null as Awaited<ReturnType<typeof prisma.patient.create>> | null;
    if (withPatient) {
      patient = await prisma.patient.create({
        data: {
          tenantId: tenant.id,
          mrn: `MRN-${suffix}`,
          firstNameEn: "Pat",
          lastNameEn: "One",
          gender: Gender.F,
          phone: "+201055500011",
        },
      });
    }
    return { tenant, sub, clinic, owner, patient, config, start };
  }

  it("shortens unqualified trial to standard days and logs SubscriptionEvent", async () => {
    const { tenant, sub, config, start } = await seedTrialTenant(false);
    const afterWindow = new Date(start.getTime() + (config.activationWindowDays + 1) * 86_400_000);
    const prior = await prisma.subscriptionEvent.count({ where: { subscriptionId: sub.id } });
    const loaded = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: { tenant: { include: { market: true } } },
    });
    await trialEngine.runDailyForSubscription(loaded as never, afterWindow);
    const updated = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    const expectedEnd = standardTrialEndsAt(start, config);
    assert.equal(updated.trialEndsAt?.toISOString(), expectedEnd.toISOString());
    const events = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: sub.id, type: "trial_shortened" },
    });
    assert.ok(events.length >= 1);
    assert.ok((await prisma.subscriptionEvent.count({ where: { subscriptionId: sub.id } })) > prior);
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it("downgrade to Lite keeps clinical records visible", async () => {
    const { tenant, sub, clinic, owner, patient, start } = await seedTrialTenant(true);
    if (!patient) throw new Error("patient required");
    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        clinicId: clinic.id,
        patientId: patient.id,
        clinicianId: owner.id,
        startsAt: start,
        status: AppointmentStatus.COMPLETED,
        checkedInAt: start,
      },
    });
    const lite = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.GRACE,
        postTrialGraceUntil: new Date(Date.now() - 1000),
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    });
    const loaded = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: { tenant: { include: { market: true } } },
    });
    await trialEngine.runDailyForSubscription(loaded as never, new Date());
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    assert.equal(after.planId, lite.id);
    assert.equal(after.status, SubscriptionStatus.ACTIVE);
    const patients = await prisma.patient.count({ where: { tenantId: tenant.id } });
    const appointments = await prisma.appointment.count({ where: { tenantId: tenant.id } });
    assert.equal(patients, 1);
    assert.equal(appointments, 1);
    const downgradeEvents = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: sub.id, type: "trial_downgraded_lite" },
    });
    assert.ok(downgradeEvents.length >= 1);
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });
});