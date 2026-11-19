import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  KiorlyLineType,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const creditWallet = new CreditWalletService(prismaSvc);
const gateways = new PaymentGatewayRegistry();
const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
const kiorlyPayments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, {
  reconcileAfterPayment: async () => {},
} as unknown as import("../subscriptions/dunning.service").DunningService, {
  tryOnInvoiceFullyPaid: async () => {},
} as unknown as import("../growth/referral-reward.service").ReferralRewardService);
const invoices = new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments);

describe("SB-01 Kiorly invoices", () => {
  const suffix = `sb01-${Date.now()}`;
  let isolatedMarketId: string;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({
      data: {
        code: `SB01${randomUUID().replace(/-/g, "").slice(0, 8)}`,
        nameEn: `SB01 market ${suffix}`,
        hostCell: "frankfurt",
        defaultCurrency: "EGP",
        defaultLocale: "en",
        defaultTimezone: "Africa/Cairo",
        weekendDays: [5, 6],
        enabledLanguages: ["en", "ar"],
        defaultPhoneRegion: "EG",
      },
    });
    isolatedMarketId = market.id;
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant() {
    const market = await prisma.market.findUniqueOrThrow({ where: { id: isolatedMarketId } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Kiorly inv ${suffix}`,
        nameAr: `Kiorly inv ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return tenant;
  }

  const line = {
    type: KiorlyLineType.SUBSCRIPTION,
    descEn: "Pro subscription",
    descAr: "اشتراك برو",
    quantity: 1,
    unitAmount: 1299,
    amount: 1299,
  };

  it("numbering is gapless under concurrency", async () => {
    const tenant = await seedTenant();
    const start = new Date("2026-11-01T00:00:00.000Z");
    const end = new Date("2026-11-30T23:59:59.999Z");
    const batch = `${suffix}-gapless`;

    const created = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        invoices.createDraft(tenant.id, {
          periodKey: `${batch}-p-${i}`,
          periodStart: start,
          periodEnd: end,
          currency: "EGP",
          lines: [line],
        }),
      ),
    );

    const sequences = created
      .map((inv) => Number.parseInt(inv.number.split("-").pop() ?? "0", 10))
      .sort((a, b) => a - b);
    assert.equal(new Set(sequences).size, sequences.length, "duplicate invoice sequence");
    const min = Math.min(...sequences);
    const max = Math.max(...sequences);
    assert.equal(max - min + 1, sequences.length, "sequence gap detected in concurrent batch");
  });

  it("no code path updates lines of an ISSUED invoice", async () => {
    const tenant = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-issued`,
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-31T23:59:59.999Z"),
      currency: "EGP",
      lines: [line],
    });
    await invoices.issue(tenant.id, draft.id);

    await assert.rejects(
      () =>
        invoices.replaceDraftLines(tenant.id, draft.id, [
          { ...line, amount: 999, unitAmount: 999 },
        ]),
      (e: Error) => e.message.includes("Cannot modify lines"),
    );
  });
});