import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, MessageChannel } from "@prisma/client";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { OutboxEventService } from "./outbox-event.service";
import { AppointmentOutboxService } from "./appointment-outbox.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { OutboundMessageWorker } from "./outbound-message.worker";
import { WhatsAppSendService } from "./whatsapp-send.service";

const prisma = new PrismaClient();

function webhookService(): WhatsAppWebhookService {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const outbox = new OutboxEventService(prismaSvc);
  const appointmentOutbox = new AppointmentOutboxService(outbox);
  const scheduling = new SchedulingService(
    prismaSvc,
    {
      assertTenantCanEnableKiorexMarketplace: async () => undefined,
    } as never,
    { invalidateAndNotify: async () => undefined } as never,
  );
  const tokens = new AppointmentRescheduleTokenService(prismaSvc);
  const consent = new MessagingConsentService(prismaSvc, audit, new ConsentPolicyService(prismaSvc, audit));
  const inbound = new WhatsAppInboundRepliesService(
    prismaSvc,
    audit,
    outbox,
    appointmentOutbox,
    scheduling,
    tokens,
    consent,
    { handleReply: async () => ({ handled: false }) } as never,
  );
  return new WhatsAppWebhookService(prismaSvc, audit, inbound, consent, {
    createFromWhatsAppInbound: async () => ({ created: false }),
  } as never);
}

describe("MS-01 WhatsApp delivery status", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("webhook updates deliveredAt within seconds", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    const providerMessageId = `wamid.test.${Date.now()}`;
    const row = await prisma.outboundMessage.create({
      data: {
        tenantId: tenant.id,
        channel: MessageChannel.WHATSAPP,
        templateKey: "appointment_reminder_whatsapp",
        toPhone: "+201000000099",
        body: "preview",
        status: "SENT",
        providerMessageId,
        sentAt: new Date(),
      },
    });
    const webhook = webhookService();
    const ts = Math.floor(Date.now() / 1000);
    await webhook.handlePayload({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: row.providerMessageId, status: "delivered", timestamp: String(ts) }],
              },
            },
          ],
        },
      ],
    });
    const updated = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } });
    assert.ok(updated.deliveredAt);
    assert.equal(updated.status, "DELIVERED");
    const deltaMs = updated.deliveredAt!.getTime() - row.sentAt!.getTime();
    assert.ok(deltaMs < 60_000, "status should update within seconds in staging");
    await prisma.outboundMessage.delete({ where: { id: row.id } });
  });
});

describe("MS-01 worker template policy", () => {
  it("marks row FAILED when templateKey missing", async () => {
    const prismaSvc = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaSvc);
    const consent = new MessagingConsentService(prismaSvc, audit, new ConsentPolicyService(prismaSvc, audit));
    const usage = { incrementOnce: async () => true } as unknown as import("../usage/usage-meter.service").UsageMeterService;
    const worker = new OutboundMessageWorker(
      prismaSvc,
      new WhatsAppSendService(prismaSvc),
      consent,
      usage,
    );
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    const row = await prisma.outboundMessage.create({
      data: {
        tenantId: tenant.id,
        channel: MessageChannel.WHATSAPP,
        toPhone: "+201000000088",
        body: "no template",
        status: "QUEUED",
      },
    });
    await worker.processBatch();
    const updated = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(updated.status, "FAILED");
    assert.equal(updated.failureClass, "POLICY");
    await prisma.outboundMessage.delete({ where: { id: row.id } });
  });
});