import { SmsService } from "../messaging/providers/sms.service";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PaymentGatewayRegistry } from "../billing-platform/payment-gateways/payment-gateway.registry";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { EmailService } from "../messaging/email.service";
import { WhatsAppSendService } from "../messaging/whatsapp-send.service";
import { sendWhatsAppMessage } from "../messaging/whatsapp.provider";
import { WhatsAppWebhookService } from "../messaging/whatsapp-webhook.service";
import type { PrismaService } from "../prisma/prisma.service";
import { DevInboxGuard } from "./dev-inbox.guard";
import { DevInboxService } from "./dev-inbox.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("mock providers: every message lands in the dev inbox; delivery, replies and PSP callbacks are simulated", () => {
  const stamp = Date.now();
  let tenantId: string;
  const inboundCalls: unknown[] = [];
  const pspCalls: { provider: string; raw: string; sig: string }[] = [];
  let inbox: DevInboxService;
  let email: EmailService;
  let wa: WhatsAppSendService;

  before(async () => {
    await prisma.$connect();
    tenantId = (await prisma.tenant.findFirstOrThrow({ where: { market: { is: { code: "EG" } } } })).id;
    for (const k of ["KIORLY_PROVIDER_MODE", "KIORLY_PROVIDER_MODE_EMAIL", "KIORLY_PROVIDER_MODE_WHATSAPP", "KIORLY_PROVIDER_MODE_SMS"]) delete process.env[k];
    DevInboxRecorder.bind(prisma);
    email = new EmailService(prismaSvc);
    wa = new WhatsAppSendService(prismaSvc);
    const audit = new AuditService(prismaSvc);
    // Real webhook service for delivery receipts; inbound replies recorded by stubbed collaborators.
    const webhook = new WhatsAppWebhookService(
      prismaSvc,
      audit,
      { handleButtonReply: async (...a: unknown[]) => (inboundCalls.push(a), true) } as never,
      { revokeAllWhatsAppForPhone: async () => 0 } as never,
      {} as never,
      { handleInboundText: async (...a: unknown[]) => (inboundCalls.push(a), { handled: true }) } as never,
    );
    inbox = new DevInboxService(
      prismaSvc,
      webhook,
      email,
      { handleWebhook: async (provider: string, raw: string, sig: string) => (pspCalls.push({ provider, raw, sig }), { ok: true }) } as never,
      new PaymentGatewayRegistry(),
      new SmsService(),
      wa,
    );
  });
  after(async () => {
    await prisma.outboundMessage.deleteMany({ where: { tenantId, toPhone: { startsWith: "+2010" }, templateKey: "appointment_reminder_whatsapp", body: "Reminder: tomorrow 10:00" } });
    DevInboxRecorder.bind(null);
    await prisma.$disconnect();
  });

  it("email in mock mode (default) renders into the inbox and a bounce is simulated through recordBounce", async () => {
    const to = `mock.${stamp}@example.com`;
    const sent = await email.send({ tenantId, to, templateKey: "password_reset", locale: "en", variables: { resetLink: "https://app.example/reset?t=1" } });
    assert.equal(sent.ok, true);
    const rows = (await inbox.list({ channel: "EMAIL", to })).items;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.direction, "OUT");
    assert.ok(rows[0]!.subject && rows[0]!.bodyHtml?.includes("https://app.example/reset?t=1"));
    assert.equal(rows[0]!.status, "SENT");
    await inbox.simulateDelivery(rows[0]!.id, "delivered");
    assert.equal((await prisma.emailMessage.findFirstOrThrow({ where: { toEmail: to } })).status, "DELIVERED");
    await inbox.simulateDelivery(rows[0]!.id, "bounced");
    assert.equal((await prisma.emailMessage.findFirstOrThrow({ where: { toEmail: to } })).status, "BOUNCED");
    assert.equal((await inbox.get(rows[0]!.id)).status, "BOUNCED");
  });

  it("WhatsApp template send is mock by default (no provider), is viewable, and delivery receipts update the outbound row", async () => {
    const phone = `+2010${String(stamp).slice(-8)}`;
    const msg = await prisma.outboundMessage.create({
      data: { tenantId, channel: "WHATSAPP", templateKey: "appointment_reminder_whatsapp", toPhone: phone, body: "Reminder: tomorrow 10:00", status: "SENT" },
    });
    const res = await wa.sendTemplateForTenant(tenantId, "appointment_reminder_whatsapp", phone, { name: "Mona", clinic: "Nile", time: "10:00" }, {
      quickReplies: ["Confirm", "Cancel"],
      renderedBody: msg.body,
      relatedId: msg.id,
    });
    assert.equal(res.ok, true);
    const providerMessageId = (res as { providerMessageId: string }).providerMessageId;
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { providerMessageId, status: "SENT" } });
    const row = (await inbox.list({ channel: "WHATSAPP", to: phone })).items[0]!;
    assert.equal(row.bodyText, "Reminder: tomorrow 10:00");
    assert.deepEqual(row.quickReplies, ["Confirm", "Cancel"]);
    assert.equal(row.relatedId, msg.id);

    await inbox.simulateDelivery(row.id, "delivered");
    assert.equal((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: msg.id } })).status, "DELIVERED");
    await inbox.simulateDelivery(row.id, "read");
    assert.equal((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: msg.id } })).status, "READ");
    await inbox.simulateDelivery(row.id, "failed", "Simulated");
    const failed = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: msg.id } });
    assert.equal(failed.status, "FAILED");
    assert.match(failed.error ?? "", /Simulated/);
    assert.deepEqual((await inbox.get(row.id)).statusHistory && ((await inbox.get(row.id)).statusHistory as { status: string }[]).map((h) => h.status), ["SENT", "DELIVERED", "READ", "FAILED"]);
  });

  it("legacy free-form WhatsApp (signup OTP) also lands in the inbox in mock mode, even in production NODE_ENV", async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const phone = `+2011${String(stamp).slice(-8)}`;
    const res = await sendWhatsAppMessage(phone, "Kiorly signup code: 123456");
    process.env.NODE_ENV = prior;
    assert.equal(res.ok, true);
    const row = (await inbox.list({ channel: "WHATSAPP", to: phone })).items[0]!;
    assert.match(row.bodyText, /123456/);
  });

  it("simulated inbound replies go through the real webhook handler with the original message as context", async () => {
    const phone = `+2012${String(stamp).slice(-8)}`;
    const providerMessageId = `dev-ctx-${stamp}`;
    const id = await DevInboxRecorder.record({ channel: "WHATSAPP", toAddress: phone, bodyText: "Offer", providerMessageId, quickReplies: ["Accept"] });
    inboundCalls.length = 0;
    const out = await inbox.simulateInboundWhatsApp({ fromPhone: phone, buttonPayload: "KIORLY_WAITLIST_ACCEPT", replyToId: id! });
    assert.equal(out.handled.replies, 1);
    const [args, action] = inboundCalls[0] as [{ contextProviderMessageId?: string; payload: string; fromPhone: string }, string];
    assert.equal(args.contextProviderMessageId, providerMessageId);
    assert.equal(args.payload, "KIORLY_WAITLIST_ACCEPT");
    assert.equal(args.fromPhone, phone);
    assert.equal(action, "waitlist_accept");
    const inbound = (await inbox.list({ direction: "IN", to: "clinic" })).items.find((r) => r.fromAddress === phone);
    assert.ok(inbound);
    assert.equal((await inbox.get(id!)).status, "REPLIED");
    await assert.rejects(() => inbox.simulateInboundWhatsApp({ fromPhone: phone }));
  });

  it("PSP callbacks are signed exactly as the provider would and sent through the real webhook handler", async () => {
    pspCalls.length = 0;
    await inbox.simulatePspCallback({ provider: "paymob", outcome: "succeeded", tenantId, invoiceId: "inv_1", amount: "100.00" });
    await inbox.simulatePspCallback({ provider: "fawry", outcome: "failed", tenantId, invoiceId: "inv_2" });
    const gateways = new PaymentGatewayRegistry();
    for (const c of pspCalls) {
      assert.equal(gateways.get(c.provider)!.verifyWebhookSignature(c.raw, c.sig), true, `${c.provider} signature`);
    }
    const paymob = gateways.get("paymob")!.parseWebhook(JSON.parse(pspCalls[0]!.raw));
    assert.deepEqual([paymob.status, paymob.tenantId, paymob.invoiceId, paymob.amount], ["succeeded", tenantId, "inv_1", "100.00"]);
    const fawry = gateways.get("fawry")!.parseWebhook(JSON.parse(pspCalls[1]!.raw));
    assert.deepEqual([fawry.status, fawry.tenantId, fawry.invoiceId], ["failed", tenantId, "inv_2"]);
    await assert.rejects(() => inbox.simulatePspCallback({ provider: "instapay", outcome: "succeeded", tenantId, invoiceId: "x" }));
  });

  it("the dev inbox does not exist in production unless explicitly enabled and keyed", () => {
    const guard = new DevInboxGuard();
    const ctx = (headers: Record<string, string>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;
    const prior = { env: process.env.NODE_ENV, en: process.env.DEV_INBOX_ENABLED, key: process.env.DEV_INBOX_KEY };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.DEV_INBOX_ENABLED;
      assert.throws(() => guard.canActivate(ctx({})), NotFoundException);
      process.env.DEV_INBOX_ENABLED = "1";
      process.env.DEV_INBOX_KEY = "k";
      assert.throws(() => guard.canActivate(ctx({})), UnauthorizedException);
      assert.equal(guard.canActivate(ctx({ "x-dev-inbox-key": "k" })), true);
      process.env.NODE_ENV = "test";
      assert.equal(guard.canActivate(ctx({})), true);
    } finally {
      process.env.NODE_ENV = prior.env;
      if (prior.en === undefined) delete process.env.DEV_INBOX_ENABLED;
      else process.env.DEV_INBOX_ENABLED = prior.en;
      if (prior.key === undefined) delete process.env.DEV_INBOX_KEY;
      else process.env.DEV_INBOX_KEY = prior.key;
    }
  });
});
