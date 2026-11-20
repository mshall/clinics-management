import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey, PrismaClient } from "@prisma/client";
import { KiorexProgressService } from "./kiorex-progress.service";
import { SettlementService } from "./settlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CR-07 kiorex progress nudges", () => {
  const suffix = `cr07-${Date.now()}`;
  let tenantId: string;
  let progress: KiorexProgressService;
  const periodKey = "2027-08";

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
    const settlement = new SettlementService(
      prismaSvc,
      new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments),
    );
    progress = new KiorexProgressService(prismaSvc, settlement);

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `CR07 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        baseCurrency: "EGP",
      },
    });
    tenantId = tenant.id;

    await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
  });

  after(async () => {
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.kiorexProgressNudge.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it("records each threshold at most once per period", async () => {
    const first = await progress.recordThresholdNudges(tenantId, periodKey, 85);
    const second = await progress.recordThresholdNudges(tenantId, periodKey, 85);
    assert.deepEqual(first.sort(), [50, 80]);
    assert.deepEqual(second, []);
    const rows = await prisma.kiorexProgressNudge.findMany({
      where: { tenantId, periodKey },
      orderBy: { threshold: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.threshold),
      [50, 80],
    );
  });
});