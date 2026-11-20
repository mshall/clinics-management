import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { EmailService } from "./email.service";
import { EmailOutboxService } from "./email-outbox.service";
import { DevEmailProvider } from "./email.provider";
import { InternalOutboxConsumerService } from "./internal-outbox-consumer.service";
import { OwnerNotificationsService } from "./owner-notifications.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

describe("MS-05 transactional email integration", () => {
  const prisma = createPrismaClient();
  let tenantId: string;
  let email: EmailService;
  let outbox: EmailOutboxService;

  before(async () => {
    const tenant = await prisma.tenant.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    assert.ok(tenant, "seeded tenant required");
    tenantId = tenant.id;
    email = new EmailService(prisma as never);
    email.useProvider(new DevEmailProvider());
    outbox = new EmailOutboxService(email);
  });

  after(async () => {
    await prisma.emailMessage.deleteMany({ where: { tenantId, templateKey: { startsWith: "trial_" } } }).catch(() => undefined);
    await prisma.emailMessage.deleteMany({ where: { tenantId, templateKey: { in: ["trial_notification", "kiorly_invoice_statement"] } } });
    await prisma.$disconnect();
  });

  it("sends trial notification email and records EmailMessage", async () => {
    const to = "ms05-trial-owner@example.com";
    const res = await outbox.deliverTrialNotification(tenantId, {
      channel: "email",
      to,
      kind: "trial_ending",
      daysRemaining: 14,
      planName: "Pro",
    });
    assert.equal(res.sent, true);
    const row = await prisma.emailMessage.findFirst({
      where: { tenantId, templateKey: "trial_notification", toEmail: to },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(row);
    assert.equal(row!.status, "SENT");
    assert.ok(row!.providerMessageId);
  });

  it("internal outbox consumer delivers statement-ready email channel", async () => {
    const to = "ms05-statement-owner@example.com";
    const event = await prisma.outboxEvent.create({
      data: {
        tenantId,
        type: "billing.monthly_statement_ready",
        aggregateType: "KiorlyInvoice",
        aggregateId: `ms05-test-${Date.now()}`,
        target: "INTERNAL",
        status: "PENDING",
        payload: {
          channel: "email",
          to,
          invoiceNumber: "MS05-1",
          periodKey: "2026-11",
          total: "10.00",
          currency: "EGP",
          statementPath: "/api/v1/billing/statements/2026-11?format=pdf",
        },
      },
    });
    const owners = { shiftClosed: async () => ({ sent: 0 }) } as unknown as OwnerNotificationsService;
    const consumer = new InternalOutboxConsumerService(prisma as never, owners, outbox);
    const batch = await consumer.processBatch(10, { tenantId });
    assert.ok(batch.sent >= 1);
    const updated = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    assert.equal(updated?.status, "SENT");
    const mail = await prisma.emailMessage.findFirst({
      where: { tenantId, templateKey: "kiorly_invoice_statement", toEmail: to },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(mail);
    assert.equal(mail!.status, "SENT");
  });

  it("records bounce against provider message id", async () => {
    const sent = await email.send({
      tenantId,
      to: "bounce-test@example.com",
      templateKey: "security_alert",
      locale: "en",
      variables: { event: "test", detail: "bounce" },
    });
    assert.equal(sent.ok, true);
    if (!sent.ok) return;
    const bounce = await email.recordBounce({
      providerMessageId: sent.providerMessageId,
      bounceType: "Permanent",
      diagnostic: "smtp; 550 user unknown",
    });
    assert.equal(bounce.updated, 1);
    const row = await prisma.emailMessage.findUnique({ where: { id: sent.emailMessageId } });
    assert.equal(row?.status, "BOUNCED");
    assert.equal(row?.bounceType, "Permanent");
  });
});
