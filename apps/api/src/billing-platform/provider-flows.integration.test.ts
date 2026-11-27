import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { BillingInterval, KiorlyInvoiceStatus, KiorlyLineType, KiorlyPaymentStatus, MessageChannel, PlanKey, SubscriptionStatus } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { AuditService } from "../audit/audit.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import type { DunningService } from "../subscriptions/dunning.service";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { EmailService } from "../messaging/email.service";
import { DeliveryReceiptService } from "../messaging/providers/delivery-receipt.service";
import { SmsService } from "../messaging/providers/sms.service";
import { OutboundMessageWorker } from "../messaging/outbound-message.worker";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const gateways = new PaymentGatewayRegistry();
const payments = new KiorlyPaymentService(
  svc,
  gateways,
  new KiorlyPaymentMethodsService(svc, gateways),
  { reconcileAfterPayment: async () => {} } as unknown as DunningService,
  { tryOnInvoiceFullyPaid: async () => {} } as unknown as import("../growth/referral-reward.service").ReferralRewardService,
);
const invoices = new KiorlyInvoicesService(svc, new CreditWalletService(svc), payments);

describe("mock provider flows: payment success / failure / refund and SMS delivery receipts", () => {
  const suffix = `pf-${Date.now()}`;
  const tenantIds: string[] = [];
  before(async () => {
    await prisma.$connect();
    DevInboxRecorder.bind(prisma);
  });
  after(async () => {
    DevInboxRecorder.bind(null);
    await prisma.outboundMessage.deleteMany({ where: { tenantId: { in: tenantIds }, toPhone: "+201009990000" } });
    await prisma.$disconnect();
  });

  async function issuedInvoice(tag: string) {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: { name: `PF ${suffix}-${tag}`, nameAr: `PF ${suffix}-${tag}`, baseCurrency: "EGP", marketId: market.id, deploymentCell: "frankfurt" },
    });
    tenantIds.push(tenant.id);
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: 1, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    const draft = await invoices.createDraft(tenant.id, {
      periodKey: `${suffix}-${tag}`,
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T23:59:59.999Z"),
      currency: "EGP",
      lines: [{ type: KiorlyLineType.SUBSCRIPTION, descEn: "Pro", descAr: "برو", quantity: 1, unitAmount: 300, amount: 300 }],
    });
    await invoices.issue(tenant.id, draft.id);
    return { tenant, invoiceId: draft.id };
  }

  async function pspWebhook(tenantId: string, invoiceId: string, success: boolean) {
    const key = `wh_${randomUUID()}`;
    const payload = { idempotency_key: key, transaction_id: `paymob_${key}`, tenant_id: tenantId, invoice_id: invoiceId, amount: "300.00", currency: "EGP", success };
    const raw = JSON.stringify(payload);
    const sig = createHmac("sha256", process.env.KIORLY_PAYMOB_WEBHOOK_SECRET ?? "dev-paymob-secret").update(raw, "utf8").digest("hex");
    await payments.handleWebhook("paymob", raw, sig, payload);
    return `paymob_${key}`;
  }

  it("failure leaves the invoice unpaid; success pays it; refund reverses it and is idempotent", async () => {
    const { tenant, invoiceId } = await issuedInvoice("a");
    const failedRef = await pspWebhook(tenant.id, invoiceId, false);
    assert.equal((await prisma.kiorlyPayment.findUniqueOrThrow({ where: { providerRef: failedRef } })).status, KiorlyPaymentStatus.FAILED);
    assert.equal((await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, KiorlyInvoiceStatus.ISSUED);

    const okRef = await pspWebhook(tenant.id, invoiceId, true);
    const pay = await prisma.kiorlyPayment.findUniqueOrThrow({ where: { providerRef: okRef } });
    assert.equal((await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, KiorlyInvoiceStatus.PAID);

    const r1 = await payments.refundPaymentInternal(pay.id);
    assert.equal(r1.status, "REFUNDED");
    const r2 = await payments.refundPaymentInternal(pay.id);
    assert.equal((r2 as { alreadyRefunded?: boolean }).alreadyRefunded, true);
    assert.equal((await prisma.kiorlyPayment.findUniqueOrThrow({ where: { id: pay.id } })).status, KiorlyPaymentStatus.REFUNDED);
    const inv = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    assert.equal(inv.status, KiorlyInvoiceStatus.ISSUED);
    assert.ok(inv.amountPaid.lte(0));
  });

  it("SMS: worker sends through the port into the dev inbox, receipts are persisted and idempotent", async () => {
    const tenant = (await prisma.tenant.findFirstOrThrow({ select: { id: true } }));
    tenantIds.push(tenant.id);
    const row = await prisma.outboundMessage.create({
      data: { tenantId: tenant.id, channel: MessageChannel.SMS, toPhone: "+201009990000", body: "Your code is 123456", status: "QUEUED" },
    });
    const consent = { isSamplePatient: async () => false, assertCanSend: async () => undefined };
    const worker = new OutboundMessageWorker(svc, {} as never, consent as never, {} as never, new SmsService());
    // The worker takes a bounded batch of the oldest QUEUED rows of the whole database: other tests leave queued rows behind, so drain until this row is picked up.
    for (let i = 0; i < 50; i += 1) {
      await worker.processBatch();
      if ((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } })).status !== "QUEUED") break;
    }
    const sent = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(sent.status, "SENT");
    assert.equal(sent.providerMessageId, `dev-sms-${row.id}`);
    assert.ok(await prisma.devInboxMessage.findFirst({ where: { channel: "SMS", providerMessageId: sent.providerMessageId } }));

    const receipts = new DeliveryReceiptService(svc, new EmailService(svc), new AuditService(svc));
    const r1 = await receipts.apply("sms", [{ providerMessageId: sent.providerMessageId!, status: "delivered" }]);
    const r2 = await receipts.apply("sms", [{ providerMessageId: sent.providerMessageId!, status: "delivered" }]);
    assert.equal(r1.updated, 1);
    assert.equal(r2.updated, 0);
    assert.equal((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } })).status, "DELIVERED");
    const r3 = await receipts.apply("sms", [{ providerMessageId: sent.providerMessageId!, status: "failed", error: "late failure" }]);
    assert.equal(r3.updated, 1);
    assert.equal((await receipts.apply("sms", [{ providerMessageId: "nope", status: "read" }])).unknown, 1);
  });
});
