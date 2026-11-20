import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CommissionChargeStatus,
  FeeType,
  Gender,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { SettlementService } from "./settlement.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CR-06 settlement persistence", () => {
  const suffix = `cr06-${Date.now()}`;
  let tenantId: string;
  let settlement: SettlementService;
  const periodKey = "2027-06";

  before(async () => {
    await prisma.$connect();
    const prismaSvc = prisma as unknown as PrismaService;
    const creditWallet = new CreditWalletService(prismaSvc);
    const gateways = new PaymentGatewayRegistry();
    const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
    const kiorlyPayments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, {
      reconcileAfterPayment: async () => {},
    } as unknown as import("../subscriptions/dunning.service").DunningService, {
      tryOnInvoiceFullyPaid: async () => {},
    } as unknown as import("../growth/referral-reward.service").ReferralRewardService);
    settlement = new SettlementService(
      prismaSvc,
      new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments),
    );

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const price = await prisma.planPrice.findFirst({
      where: { planId: plan.id, marketId: market.id, validTo: null },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: `CR06 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        baseCurrency: "EGP",
      },
    });
    tenantId = tenant.id;

    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Clinic",
        nameAr: "عيادة",
        country: "EG",
        city: "Cairo",
        addressEn: "St",
        addressAr: "شارع",
        locationUrl: "https://maps.example/c",
        phone: "+201000000099",
        email: `cr6-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: "GROUP_ADMIN",
        isTenantOwner: true,
      },
    });

    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        planPriceId: price?.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date("2027-06-01"),
        currentPeriodEnd: new Date("2027-07-01"),
      },
    });

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN6-${suffix}`,
        firstNameEn: "N",
        lastNameEn: "P",
        gender: Gender.UNKNOWN,
        phone: `+2012${String(Date.now()).slice(-8)}`,
        nationalId: `id6-${suffix}`,
      },
    });

    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId: clinic.id,
        patientId: patient.id,
        clinicianId: user.id,
        startsAt: new Date("2027-06-15"),
        feeAmount: 300,
        checkedInAt: new Date("2027-06-15T10:00:00Z"),
      },
    });

    let rate = await prisma.kiorexCommissionRate.findFirst({ where: { marketId: market.id } });
    if (!rate) {
      rate = await prisma.kiorexCommissionRate.create({
        data: { marketId: market.id, feeType: FeeType.FLAT, amount: 1200, validFrom: new Date("2020-01-01") },
      });
    }

    await prisma.kiorexCommissionCharge.create({
      data: {
        tenantId,
        clinicId: clinic.id,
        appointmentId: apt.id,
        patientId: patient.id,
        clinicianId: user.id,
        rateId: rate.id,
        amount: 1200,
        currency: "EGP",
        status: CommissionChargeStatus.CONFIRMED,
        attendedAt: new Date("2027-06-15T10:00:00Z"),
        disputeDeadline: new Date("2027-07-15"),
      },
    });
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("running settlement twice yields one draft invoice for the period", async () => {
    const first = await settlement.settlePeriod(tenantId, periodKey, { dryRun: false });
    assert.ok(first.invoiceId);
    const second = await settlement.settlePeriod(tenantId, periodKey, { dryRun: false });
    assert.equal(second.invoiceId, first.invoiceId);
    const count = await prisma.kiorlyInvoice.count({ where: { tenantId, periodKey } });
    assert.equal(count, 1);
  });
});