import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient } from "@prisma/client";
import { SignupProvisionService } from "./signup-provision.service";
import { SignupOtpService } from "./signup-otp.service";
import { PrismaService } from "../prisma/prisma.service";
import { MarketsService } from "../markets/markets.service";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { MarketProvisionService } from "../markets/market-provision.service";
import { AuditService } from "../audit/audit.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { legalAcceptancesPayload, requiredLegalForSignup } from "../legal/legal-catalog";
import { CohortService } from "../cohorts/cohort.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const markets = new MarketsService(prismaSvc, {} as FeatureFlagsService, {} as MarketProvisionService);
const legal = new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc));
const provision = new SignupProvisionService(prismaSvc, markets, legal, new CohortService());

describe("ON-01 public signup provision", () => {
  before(async () => {
    await prisma.$connect();
    process.env.SIGNUP_OTP_DEV_CODE = "424242";
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("provisions tenant stack atomically and rolls back on duplicate email", async () => {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG", status: "LIVE" } });
    const suffix = `${Date.now()}`;
    const email = `on01.${suffix}@example.com`;
    const created = await provision.provision({
      phone: `2010${String(suffix).slice(-8)}`,
      marketId: market.id,
      profile: { displayName: "Dr Signup Test", email, password: "demopass8" },
      specialty: "GENERAL_MEDICINE",
      clinic: { nameEn: `Signup Clinic ${suffix}`, city: "Cairo", locationUrl: "https://maps.example/o" },
      planKey: PlanKey.LITE,
      legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.LITE)),
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: created.tenantId } });
    assert.ok(tenant, "provision should persist tenant");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: created.tenantId } });
    assert.ok(sub);
    const wallet = await prisma.creditWallet.findUnique({ where: { tenantId: created.tenantId } });
    assert.ok(wallet);
    const types = await prisma.appointmentType.count({ where: { tenantId: created.tenantId } });
    assert.ok(types >= 2);
    const avail = await prisma.clinicianAvailabilityTemplate.findFirst({ where: { tenantId: created.tenantId } });
    assert.ok(avail);
    const templates = await prisma.messageTemplate.count({ where: { tenantId: created.tenantId } });
    assert.ok(templates >= 3);
    const onboarding = await prisma.onboardingProgress.findUnique({ where: { tenantId: created.tenantId } });
    assert.ok(onboarding);

    await assert.rejects(async () => {
      await provision.provision({
        phone: `2011${String(suffix).slice(-8)}`,
        marketId: market.id,
        profile: { displayName: "Dr Other", email, password: "demopass8" },
        specialty: "GENERAL_MEDICINE",
        clinic: { nameEn: "Should Fail", city: "Cairo" },
        planKey: PlanKey.LITE,
        legalAcceptances: legalAcceptancesPayload(requiredLegalForSignup(PlanKey.LITE)),
      });
    });

    await prisma.tenant.delete({ where: { id: created.tenantId } });
  });

  it("OTP verify issues signup token when dev code set", async () => {
    const jwt = new JwtService({ secret: process.env.JWT_SECRET || "dev-jwt-secret-change-me", signOptions: { expiresIn: "30m" } });
    const config = new ConfigService({ SIGNUP_OTP_DEV_CODE: "424242" });
    const otp = new SignupOtpService(prisma as unknown as PrismaService, markets, jwt, config);
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const phone = `20155${String(Date.now()).slice(-7)}`;
    await otp.sendOtp({ phone, market: market.code });
    const verified = await otp.verifyOtp({ phone, code: "424242", market: market.code });
    assert.ok(verified.signupToken.length > 20);
  });
});