import assert from "node:assert/strict";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CreditReason,
  KiorlyLineType,
  KiorlyPaymentStatus,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { buildKiorlyInvoicePdf } from "./kiorly-invoice-pdf";

config({ path: resolve(process.cwd(), ".env") });

const isCi = process.env.CI === "true";
const prisma = new PrismaClient();

describe("QA-02 Kiorly SaaS money path", () => {
  const suffix = `qa02-${Date.now()}`;
  const prismaSvc = prisma as unknown as PrismaService;
  const creditWallet = new CreditWalletService(prismaSvc);
  const gateways = new PaymentGatewayRegistry();
  const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
  const dunningStub = { reconcileAfterPayment: async () => {} } as unknown as import("../subscriptions/dunning.service").DunningService;
  const payments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, dunningStub);
  const invoices = new KiorlyInvoicesService(prismaSvc, creditWallet, payments);

  before(async () => {
    if (!process.env.DATABASE_URL?.trim()) return;
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant() {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `QA02 ${suffix}`,
        nameAr: `QA02 ${suffix}`,
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
        clinicianSeats: 2,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  const owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `owner-${suffix}@qa02.test`,
        passwordHash: await bcrypt.hash("demo", 8),
        displayName: "Owner",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    return { tenant, owner };
  }

  const subLine = {
    type: KiorlyLineType.SUBSCRIPTION,
    descEn: "Subscription",
    descAr: "اشتراك",
    quantity: 1,
    unitAmount: 800,
    amount: 800,
  };

  it("saved card pay + payment methods list", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { tenant, owner } = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-card`,
      periodStart: new Date("2026-12-01"),
      periodEnd: new Date("2026-12-31"),
      currency: "EGP",
      lines: [subLine],
    });
    await invoices.issue(tenant.id, draft.id, owner.id);

    await paymentMethods.saveTokenizedCard(tenant.id, {
      tokenRef: `tok_${randomUUID()}`,
      brand: "VISA",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
    });
    const methods = await paymentMethods.listForTenant(tenant.id);
    assert.equal(methods.length, 1);
    assert.equal(methods[0]!.last4, "4242");

    const pay = await payments.payInvoice(tenant.id, draft.id, { method: "saved_card" });
    assert.equal(pay.status, KiorlyPaymentStatus.SUCCEEDED);

    const inv = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: draft.id } });
    assert.ok(inv.amountPaid.gte(800));
  });

  it("invoice with credits applied on issue consumes wallet", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { tenant, owner } = await seedTenant();
    const { decimalAmount } = await import("../credits/credit-wallet-math");
    await creditWallet.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(300),
      reason: CreditReason.PROMO,
      note: "QA-02 promo",
    });

    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-credits`,
      periodStart: new Date("2026-12-01"),
      periodEnd: new Date("2026-12-31"),
      currency: "EGP",
      creditsApplied: 200,
      lines: [subLine],
    });
    await invoices.issue(tenant.id, draft.id, owner.id);
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.ok(wallet.balance.lte(200));
  });

  it("voidViaCreditInvoice after Fawry pending payment issues credit memo", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { tenant, owner } = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-void`,
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-30"),
      currency: "EGP",
      lines: [subLine],
    });
    await invoices.issue(tenant.id, draft.id, owner.id);
    const fawry = await payments.payInvoice(tenant.id, draft.id, { method: "fawry" });
    assert.equal(fawry.status, "PENDING");
    assert.ok("providerRef" in fawry);

    const memo = await invoices.voidViaCreditInvoice(tenant.id, draft.id, owner.id);
    assert.equal(memo.creditMemo, true);
    const original = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(original.status, "VOID");
  });

  it("buildKiorlyInvoicePdf returns a PDF header", () => {
    const buf = buildKiorlyInvoicePdf("Test invoice", [{ label: "Total", value: "100 EGP" }]);
    assert.ok(buf.subarray(0, 8).toString("utf8").startsWith("%PDF-1.4"));
  });

  it("renderPdf on issued invoice", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { tenant, owner } = await seedTenant();
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-pdf`,
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-10-31"),
      currency: "EGP",
      lines: [subLine],
    });
    await invoices.issue(tenant.id, draft.id, owner.id);
    const pdf = await invoices.renderPdf(tenant.id, draft.id);
    assert.ok(pdf.length > 100);
    assert.ok(pdf.subarray(0, 5).toString("utf8").startsWith("%PDF"));
  });
});