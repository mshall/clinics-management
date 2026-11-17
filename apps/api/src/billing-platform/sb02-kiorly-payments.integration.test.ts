import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  KiorlyLineType,
  KiorlyPaymentStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { isKiorlyDunningPaused } from "./kiorly-dunning";
import type { DunningService } from "../subscriptions/dunning.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const gateways = new PaymentGatewayRegistry();
const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
const dunningStub = { reconcileAfterPayment: async () => {} } as unknown as DunningService;
const payments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, dunningStub);
const creditWallet = new CreditWalletService(prismaSvc);
const invoices = new KiorlyInvoicesService(prismaSvc, creditWallet, payments);

describe("SB-02 Kiorly payment collection", () => {
  const suffix = `sb02-${Date.now()}`;

  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant() {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Pay ${suffix}`,
        nameAr: `Pay ${suffix}`,
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
    descEn: "Pro",
    descAr: "برو",
    quantity: 1,
    unitAmount: 500,
    amount: 500,
  };

  it("replaying the same webhook twice records one succeeded payment", async () => {
    const tenant = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-wh`,
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T23:59:59.999Z"),
      currency: "EGP",
      lines: [line],
    });
    await invoices.issue(tenant.id, draft.id);

    const idempotencyKey = `wh_${randomUUID()}`;
    const providerRef = `paymob_${idempotencyKey}`;
    const payload = {
      idempotency_key: idempotencyKey,
      transaction_id: providerRef,
      tenant_id: tenant.id,
      invoice_id: draft.id,
      amount: "500.00",
      currency: "EGP",
      success: true,
    };
    const raw = JSON.stringify(payload);
    const secret = process.env.KIORLY_PAYMOB_WEBHOOK_SECRET ?? "dev-paymob-secret";
    const sig = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

    const r1 = await payments.handleWebhook("paymob", raw, sig, payload);
    const r2 = await payments.handleWebhook("paymob", raw, sig, payload);
    assert.equal(r1.duplicate, false);
    assert.equal(r2.duplicate, true);

    const count = await prisma.kiorlyPayment.count({
      where: { providerRef, status: KiorlyPaymentStatus.SUCCEEDED },
    });
    assert.equal(count, 1);

    const inv = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: draft.id } });
    assert.ok(inv.amountPaid.gte(500));
  });

  it("manual InstaPay stays UNDER_REVIEW, pauses dunning, until platform verify", async () => {
    const tenant = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-ip`,
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T23:59:59.999Z"),
      currency: "EGP",
      lines: [line],
    });
    await invoices.issue(tenant.id, draft.id);

    const pay = await payments.payInvoice(tenant.id, draft.id, {
      method: "instapay",
      proofUploadKey: "kiorly-payments/test-proof.pdf",
    });
    assert.equal(pay.status, "UNDER_REVIEW");
    assert.ok("paymentId" in pay && pay.paymentId);

    const inv = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(inv.paymentUnderReview, true);

    const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.ok(subBefore.kiorlyDunningPausedUntil);
    assert.equal(isKiorlyDunningPaused(subBefore), true);

    let platformUser = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      select: { id: true, email: true, role: true, additionalRoles: true, tenantId: true },
    });
    if (!platformUser) {
      platformUser = await prisma.user.create({
        data: {
          email: `platform-${suffix}@kiorly.test`,
          passwordHash: await bcrypt.hash("test-platform", 8),
          role: UserRole.PLATFORM_SUPER_ADMIN,
          tenantId: null,
          displayName: "Platform",
        },
        select: { id: true, email: true, role: true, additionalRoles: true, tenantId: true },
      });
    }

    await payments.verifyManualPayment(
      {
        userId: platformUser.id,
        tenantId: null,
        email: platformUser.email,
        role: platformUser.role,
        additionalRoles: platformUser.additionalRoles ?? [],
      },
      (pay as { paymentId: string }).paymentId,
      true,
    );

    const invAfter = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(invAfter.paymentUnderReview, false);
    const subAfter = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(subAfter.kiorlyDunningPausedUntil, null);
  });
});