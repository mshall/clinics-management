import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CommissionChargeStatus,
  FeeType,
  Gender,
  KiorlyInvoiceStatus,
  KiorlyLineType,
  ListingStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { AuditService } from "../audit/audit.service";
import { BillingSeatService } from "../subscriptions/billing-seat.service";
import { SubscriptionService } from "../subscriptions/subscription.service";
import { SubscriptionRenewalService } from "../subscriptions/subscription-renewal.service";
import { DunningService } from "../subscriptions/dunning.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { LiteFeesService } from "./lite-fees.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { SettlementService } from "./settlement.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("SB-05 Lite commission invoicing (integration)", () => {
  const suffix = `sb05-${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let ownerId: string;
  let patientId: string;
  let rateId: string;
  let settlement: SettlementService;
  let liteFees: LiteFeesService;
  let dunning: DunningService;
  let owner: JwtUser;

  async function addCharge(attendedAt: string, amount: number) {
    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: ownerId,
        startsAt: new Date(attendedAt),
        feeAmount: 300,
        checkedInAt: new Date(attendedAt),
      },
    });
    return prisma.kiorexCommissionCharge.create({
      data: {
        tenantId,
        clinicId,
        appointmentId: apt.id,
        patientId,
        clinicianId: ownerId,
        rateId,
        amount,
        currency: "EGP",
        status: CommissionChargeStatus.CONFIRMED,
        attendedAt: new Date(attendedAt),
        disputeDeadline: new Date(new Date(attendedAt).getTime() + 30 * 86_400_000),
      },
    });
  }

  before(async () => {
    await prisma.$connect();
    const creditWallet = new CreditWalletService(prismaSvc);
    const gateways = new PaymentGatewayRegistry();
    const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
    const kiorlyPayments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, {
      reconcileAfterPayment: async () => {},
    } as unknown as DunningService, {
      tryOnInvoiceFullyPaid: async () => {},
    } as unknown as import("../growth/referral-reward.service").ReferralRewardService);
    settlement = new SettlementService(prismaSvc, new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments));
    liteFees = new LiteFeesService(prismaSvc, settlement);
    const subs = new SubscriptionService(
      prismaSvc,
      new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc)),
      new BillingSeatService(prismaSvc),
    );
    const listings = new MarketplaceListingService(prismaSvc, new OutboxEventService(prismaSvc));
    dunning = new DunningService(
      prismaSvc,
      subs,
      listings,
      new SubscriptionRenewalService(
        prismaSvc,
        subs,
        new BillingSeatService(prismaSvc),
        listings,
        new LegalAcceptanceService(prismaSvc, new AuditService(prismaSvc)),
      ),
    );

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: { name: `SB05 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Lite clinic",
        nameAr: "عيادة لايت",
        country: "EG",
        city: "Cairo",
        addressEn: "St",
        addressAr: "شارع",
        locationUrl: "https://maps.example/sb05",
        phone: "+201000000505",
        email: `sb05-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });
    clinicId = clinic.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Lite Owner",
        role: "GROUP_ADMIN",
        isTenantOwner: true,
      },
    });
    ownerId = user.id;
    owner = { userId: user.id, tenantId, role: "GROUP_ADMIN", isTenantOwner: true } as unknown as JwtUser;
    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date("2027-08-01"),
        currentPeriodEnd: new Date("2027-09-01"),
      },
    });
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN5-${suffix}`,
        firstNameEn: "Lina",
        lastNameEn: "Kamal",
        gender: Gender.UNKNOWN,
        phone: `+2015${String(Date.now()).slice(-8)}`,
        nationalId: `id5-${suffix}`,
      },
    });
    patientId = patient.id;
    let rate = await prisma.kiorexCommissionRate.findFirst({ where: { marketId: market.id } });
    if (!rate) {
      rate = await prisma.kiorexCommissionRate.create({
        data: { marketId: market.id, feeType: FeeType.FLAT, amount: 60, validFrom: new Date("2020-01-01") },
      });
    }
    rateId = rate.id;
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("AC: below-minimum month carries forward; balance is shown and included next month", async () => {
    const augCharge = await addCharge("2027-08-10T10:00:00Z", 60);

    const aug = await settlement.settlePeriod(tenantId, "2027-08", { dryRun: false });
    assert.equal(aug.skippedBelowMinimum, true);
    assert.equal(aug.invoiceId, null);
    assert.equal(await prisma.kiorlyInvoice.count({ where: { tenantId } }), 0);

    const augAgain = await settlement.settlePeriod(tenantId, "2027-08", { dryRun: false });
    assert.equal(augAgain.carryForwardOut, "60.00", "re-running the period never doubles the carry");

    await addCharge("2027-09-12T10:00:00Z", 50);
    const card = await liteFees.getLiteFees(owner, "2027-09");
    assert.equal(card.isLite, true);
    assert.equal(card.carriedForward, "60.00");
    assert.equal(card.feesThisMonth, "50.00");
    assert.equal(card.willInvoice, true);

    const sep = await settlement.settlePeriod(tenantId, "2027-09", { dryRun: false });
    assert.equal(sep.skippedBelowMinimum, false);
    assert.ok(sep.invoiceId);
    const invoice = await prisma.kiorlyInvoice.findUniqueOrThrow({
      where: { id: sep.invoiceId },
      include: { lines: true },
    });
    const carryLine = invoice.lines.find((l) => l.refId === "carry-forward");
    assert.ok(carryLine);
    assert.equal(Number(carryLine.amount), 60);
    assert.equal(
      invoice.lines
        .filter((l) => l.type !== KiorlyLineType.TAX)
        .reduce((s, l) => s + Number(l.amount), 0),
      110,
    );

    const carried = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: augCharge.id } });
    assert.equal(carried.status, CommissionChargeStatus.BILLED);
    assert.equal(carried.kiorlyInvoiceId, sep.invoiceId);

    const sepAgain = await settlement.settlePeriod(tenantId, "2027-09", { dryRun: false });
    assert.equal(sepAgain.invoiceId, sep.invoiceId);
    const again = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: sep.invoiceId }, include: { lines: true } });
    assert.equal(again.lines.filter((l) => l.refId === "carry-forward").length, 1);

    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    assert.equal(t.kiorlySettlementCarry, null);
  });

  it("unpaid Lite commission > 30 days pauses the Kiorex listing; Kiorly stays ACTIVE; payment resumes", async () => {
    const listing = await prisma.marketplaceListing.create({
      data: { tenantId, clinicId, clinicianId: ownerId, status: ListingStatus.LIVE, profileJson: {} },
    });
    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() - 31);
    await prisma.kiorlyInvoice.create({
      data: {
        tenantId,
        number: `INV-${suffix}`,
        periodKey: `p-${suffix}`,
        periodStart: new Date(dueAt.getTime() - 30 * 86_400_000),
        periodEnd: new Date(dueAt.getTime() - 86_400_000),
        currency: "EGP",
        status: KiorlyInvoiceStatus.ISSUED,
        dueAt,
        issuedAt: new Date(dueAt.getTime() - 7 * 86_400_000),
        total: 150,
        subtotal: 150,
        tax: 0,
        amountPaid: 0,
        lines: {
          create: {
            type: KiorlyLineType.KIOREX_COMMISSION,
            descEn: "Kiorex",
            descAr: "كيوركس",
            quantity: 1,
            unitAmount: 150,
            amount: 150,
          },
        },
      },
    });

    await dunning.runForTenant(tenantId, new Date());
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    assert.equal(sub.status, SubscriptionStatus.ACTIVE, "Lite never goes read-only for unpaid commission");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    assert.ok(tenant.kiorexBillingPausedAt);
    const paused = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
    assert.equal(paused.status, ListingStatus.PAUSED);
    assert.equal(paused.pausedReason, "billing");
    const state = await dunning.getAccessState(tenantId, { isTenantOwner: true });
    assert.equal(state.marketplacePaused, true);

    await prisma.kiorlyInvoice.updateMany({
      where: { tenantId, status: KiorlyInvoiceStatus.ISSUED },
      data: { status: KiorlyInvoiceStatus.PAID, amountPaid: 150, paidAt: new Date() },
    });
    await dunning.reconcileAfterPayment(tenantId);
    const resumed = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    assert.equal(resumed.kiorexBillingPausedAt, null);
    const relisted = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
    assert.notEqual(relisted.pausedReason, "billing");
    const audits = await prisma.auditLog.count({
      where: { tenantId, action: { in: ["kiorex.listing.billing_paused", "kiorex.listing.billing_resumed"] } },
    });
    assert.equal(audits, 2);
  });
});
