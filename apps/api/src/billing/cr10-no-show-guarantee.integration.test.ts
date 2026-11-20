import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BillingInterval,
  CreditReason,
  Gender,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { DEFAULT_COMMERCIAL_CONFIG } from "../markets/commercial-config.schema";
import { PrismaService } from "../prisma/prisma.service";
import { NO_SHOW_GUARANTEE_SOURCE_REF } from "./no-show-guarantee";
import { NoShowGuaranteeService } from "./no-show-guarantee.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CR-10 no-show guarantee service", () => {
  const suffix = `${Date.now()}`;
  let marketId: string;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let doctorId: string;
  let svc: NoShowGuaranteeService;
  const activatedAt = new Date("2025-01-01T00:00:00.000Z");

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({
      data: {
        code: `CR10${suffix}`.slice(0, 12),
        nameEn: `CR10 market ${suffix}`,
        hostCell: "frankfurt",
        defaultCurrency: "EGP",
        defaultLocale: "en",
        defaultTimezone: "Africa/Cairo",
        weekendDays: [5, 6],
        enabledLanguages: ["en", "ar"],
        defaultPhoneRegion: "EG",
        commercialConfig: {
          ...DEFAULT_COMMERCIAL_CONFIG,
          noShowGuarantee: {
            enabled: true,
            targetReductionPercent: 30,
            creditMonths: 3,
            baselineDays: 30,
            evaluationDay: 120,
            minBaselineAppointments: 100,
          },
        },
      },
    });
    marketId = market.id;

    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const price = await prisma.planPrice.findFirstOrThrow({
      where: { planId: plan.id, marketId: eg.id, interval: BillingInterval.MONTHLY, validTo: null },
    });

    tenantId = (
      await prisma.tenant.create({
        data: {
          name: `CR10 ${suffix}`,
          deploymentCell: "frankfurt",
          marketId,
          baseCurrency: "EGP",
          whatsAppRemindersEnabled: true,
        },
      })
    ).id;

    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        planPriceId: price.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: activatedAt,
        currentPeriodEnd: new Date(activatedAt.getTime() + 30 * 86_400_000),
      },
    });
    await prisma.onboardingProgress.create({
      data: { tenantId, activatedAt, stepsJson: {} },
    });

    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: "CR10 clinic",
          nameAr: "عيادة",
          country: "EG",
          city: "Cairo",
          addressEn: "Street",
          addressAr: "شارع",
          locationUrl: "https://maps.example/cr10",
          timezone: "Africa/Cairo",
          phone: "201000000210",
          email: `cr10.${suffix}@example.com`,
          licenseNumber: `EG-CR10-${suffix}`,
          defaultCurrency: "EGP",
        },
      })
    ).id;

    doctorId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `cr10.dr.${suffix}@example.com`,
          passwordHash: "x",
          displayName: "Dr CR10",
          role: UserRole.PHYSICIAN,
        },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          tenantId,
          mrn: `CR10-${suffix}`,
          firstNameEn: "Pat",
          lastNameEn: "ient",
          gender: Gender.M,
          phone: `2010${suffix.slice(-8)}`,
          homeBranchId: clinicId,
        },
      })
    ).id;

    const aptData = [];
    for (let i = 0; i < 100; i++) {
      aptData.push({
        tenantId,
        clinicId,
        patientId,
        clinicianId: doctorId,
        startsAt: new Date(activatedAt.getTime() + i * 3600_000),
        endsAt: new Date(activatedAt.getTime() + i * 3600_000 + 1800_000),
        status: i < 70 ? AppointmentStatus.COMPLETED : AppointmentStatus.NO_SHOW,
      });
    }
    const day31 = new Date(activatedAt.getTime() + 31 * 86_400_000);
    for (let i = 0; i < 100; i++) {
      aptData.push({
        tenantId,
        clinicId,
        patientId,
        clinicianId: doctorId,
        startsAt: new Date(day31.getTime() + i * 3600_000),
        endsAt: new Date(day31.getTime() + i * 3600_000 + 1800_000),
        status: i < 85 ? AppointmentStatus.COMPLETED : AppointmentStatus.NO_SHOW,
      });
    }
    await prisma.appointment.createMany({ data: aptData });

    const prismaSvc = prisma as unknown as PrismaService;
    svc = new NoShowGuaranteeService(
      prismaSvc,
      new CreditWalletService(prismaSvc),
      { isEnabled: async (_t: string, key: string) => key === "whatsapp_reminders" } as unknown as FeatureFlagsService,
      { isEntitled: async (_t: string, key: string) => key === "deposits" } as unknown as EntitlementsService,
    );
  });

  after(async () => {
    if (tenantId) {
      await prisma.appointment.deleteMany({ where: { tenantId } });
      await prisma.creditLedgerEntry.deleteMany({ where: { wallet: { tenantId } } });
      await prisma.creditWallet.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.onboardingProgress.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    if (marketId) await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("grants NO_SHOW_GUARANTEE credit when reduction meets target at day 120", async () => {
    const now = new Date(activatedAt.getTime() + 120 * 86_400_000);
    const status = await svc.getForTenant({ userId: doctorId, tenantId } as never, tenantId, now);
    assert.equal(status.enabled, true);
    assert.equal(status.eligible, true);
    assert.equal(status.met, true);
    assert.equal(status.granted, false);

    const result = await svc.runDailyEvaluation(now);
    assert.ok(result.granted >= 1);

    const grant = await prisma.creditLedgerEntry.findFirst({
      where: { reason: CreditReason.NO_SHOW_GUARANTEE, sourceRef: NO_SHOW_GUARANTEE_SOURCE_REF(tenantId) },
    });
    assert.ok(grant);
    assert.ok(Number(grant!.amount) > 0);

    const again = await svc.runDailyEvaluation(now);
    assert.equal(again.granted, 0);
  });
});
