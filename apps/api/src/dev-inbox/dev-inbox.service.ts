import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { KiorlyPaymentService } from "../billing-platform/kiorly-payment.service";
import { PaymentGatewayRegistry } from "../billing-platform/payment-gateways/payment-gateway.registry";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { EmailService } from "../messaging/email.service";
import { WhatsAppWebhookService } from "../messaging/whatsapp-webhook.service";
import { SmsService } from "../messaging/providers/sms.service";
import { WhatsAppSendService } from "../messaging/whatsapp-send.service";
import { providerModes } from "../common/provider-mode";
import { PrismaService } from "../prisma/prisma.service";

export type DevDeliveryState = "delivered" | "read" | "failed" | "bounced";

const CHANNELS = ["EMAIL", "WHATSAPP", "SMS", "PUSH"] as const;

/**
 * Mock-provider dev inbox: view rendered messages, simulate delivery states and inbound WhatsApp replies, and
 * simulate PSP callbacks. Simulations go through the SAME handlers the real webhooks use (WhatsAppWebhookService,
 * KiorlyPaymentService.handleWebhook, EmailService.recordBounce), so a flow is verified end to end without providers.
 */
@Injectable()
export class DevInboxService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppWebhookService,
    private readonly email: EmailService,
    private readonly payments: KiorlyPaymentService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly sms: SmsService,
    private readonly whatsappSend: WhatsAppSendService,
  ) {}

  onModuleInit(): void {
    DevInboxRecorder.bind(this.prisma);
  }

  status() {
    return { modes: providerModes(), note: "mock = rendered into this inbox; real = provider (pre-launch pass)." };
  }

  async list(q: { channel?: string; to?: string; direction?: string; limit?: number }) {
    const channel = q.channel?.toUpperCase();
    const rows = await this.prisma.devInboxMessage.findMany({
      where: {
        ...(channel && (CHANNELS as readonly string[]).includes(channel) ? { channel } : {}),
        ...(q.direction ? { direction: q.direction.toUpperCase() } : {}),
        ...(q.to?.trim() ? { toAddress: { contains: q.to.trim(), mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(q.limit ?? 50, 1), 200),
    });
    return { items: rows };
  }

  async get(id: string) {
    const row = await this.prisma.devInboxMessage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Inbox message not found");
    return row;
  }

  private async setStatus(id: string, status: string) {
    const row = await this.get(id);
    const history = Array.isArray(row.statusHistory) ? (row.statusHistory as unknown[]) : [];
    return this.prisma.devInboxMessage.update({
      where: { id },
      data: { status, statusHistory: [...history, { status, at: new Date().toISOString() }] as Prisma.InputJsonValue },
    });
  }

  /** Simulate a provider delivery receipt for an outbound message. */
  async simulateDelivery(id: string, state: DevDeliveryState, errorMessage?: string) {
    const row = await this.get(id);
    if (row.direction !== "OUT") throw new BadRequestException("Only outbound messages have delivery receipts");
    if (!["delivered", "read", "failed", "bounced"].includes(state)) throw new BadRequestException("Unknown state");
    if (row.channel === "EMAIL") {
      if (state === "bounced" || state === "failed") {
        await this.email.recordBounce({ providerMessageId: row.providerMessageId, bounceType: "Permanent", diagnostic: errorMessage ?? "Simulated bounce" });
      } else if (row.providerMessageId) {
        await this.prisma.emailMessage.updateMany({ where: { providerMessageId: row.providerMessageId }, data: { status: "DELIVERED" } });
      }
    } else if ((row.channel === "WHATSAPP" || row.channel === "SMS") && row.providerMessageId) {
      // Same code path as Meta's status webhook (updates OutboundMessage + audit on failure).
      await this.whatsapp.handlePayload({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: row.providerMessageId,
                      status: state === "bounced" ? "failed" : state,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      ...(state === "failed" || state === "bounced"
                        ? { errors: [{ code: 131026, message: errorMessage ?? "Simulated delivery failure" }] }
                        : {}),
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
    }
    return this.setStatus(id, state === "bounced" ? "BOUNCED" : state.toUpperCase());
  }

  /**
   * Simulate a patient's WhatsApp reply: free text, or a quick-reply button (`buttonPayload`, e.g. the reminder
   * Confirm / waitlist Accept payloads). `replyToId` links the reply to an outbound inbox message as its context.
   */
  async simulateInboundWhatsApp(input: {
    fromPhone: string;
    text?: string;
    buttonPayload?: string;
    replyToId?: string;
    toDisplayPhone?: string;
  }) {
    const from = input.fromPhone?.trim();
    if (!from) throw new BadRequestException("fromPhone is required");
    if (!input.text?.trim() && !input.buttonPayload?.trim()) throw new BadRequestException("text or buttonPayload is required");
    let context: string | undefined;
    let tenantId: string | null = null;
    if (input.replyToId) {
      const original = await this.get(input.replyToId);
      context = original.providerMessageId ?? undefined;
      tenantId = original.tenantId;
    }
    const messageId = `wamid.dev.${randomUUID()}`;
    const message: Record<string, unknown> = {
      id: messageId,
      from,
      ...(context ? { context: { id: context } } : {}),
      ...(input.buttonPayload
        ? { type: "button", button: { payload: input.buttonPayload, text: input.text ?? input.buttonPayload } }
        : { type: "text", text: { body: input.text } }),
    };
    const result = await this.whatsapp.handlePayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: input.toDisplayPhone ?? "", phone_number_id: "dev" },
                messages: [message],
              },
            },
          ],
        },
      ],
    });
    const id = await DevInboxRecorder.record({
      channel: "WHATSAPP",
      direction: "IN",
      tenantId,
      toAddress: input.toDisplayPhone ?? "clinic",
      fromAddress: from,
      bodyText: input.buttonPayload ? `[button] ${input.buttonPayload}` : (input.text ?? ""),
      providerMessageId: messageId,
      relatedId: input.replyToId ?? null,
    });
    if (input.replyToId) await this.setStatus(input.replyToId, "REPLIED").catch(() => undefined);
    return { id, handled: result };
  }

  /** Simulate a PSP callback (Paymob / Fawry) for a Kiorly invoice, through the real signed-webhook handler. */
  async simulatePspCallback(input: {
    provider: string;
    outcome: "succeeded" | "failed";
    tenantId: string;
    invoiceId: string;
    amount?: string;
    currency?: string;
    idempotencyKey?: string;
  }) {
    const gateway = this.gateways.get(input.provider);
    if (!gateway?.signMockWebhook) throw new BadRequestException(`Provider ${input.provider} has no webhook simulation`);
    if (!input.tenantId || !input.invoiceId) throw new BadRequestException("tenantId and invoiceId are required");
    const key = input.idempotencyKey?.trim() || `dev-${randomUUID()}`;
    const amount = input.amount ?? "0";
    const payload =
      gateway.key === "paymob"
        ? {
            idempotency_key: key,
            transaction_id: `dev_txn_${key}`,
            success: input.outcome === "succeeded",
            tenant_id: input.tenantId,
            invoice_id: input.invoiceId,
            amount,
            currency: input.currency ?? "EGP",
          }
        : {
            requestId: key,
            fawryRefNumber: `dev_fawry_${key}`,
            merchantRefNum: `${input.tenantId}:${input.invoiceId}`,
            paymentAmount: amount,
            paymentCurrency: input.currency ?? "EGP",
            orderStatus: input.outcome === "succeeded" ? "PAID" : "FAILED",
          };
    const raw = JSON.stringify(payload);
    return this.payments.handleWebhook(gateway.key, raw, gateway.signMockWebhook(raw), payload);
  }

  /**
   * Smoke-test a channel through the SAME port production uses. Mock mode: lands in this inbox. Real mode: calls the
   * configured provider (use it once on staging as the go-live check). Never for patients: pass your own number/email.
   */
  async sendTest(input: { channel: string; to: string; body?: string; templateKey?: string; tenantId?: string }) {
    const to = input.to?.trim();
    if (!to) throw new BadRequestException("to is required");
    const channel = input.channel?.toLowerCase();
    const body = input.body?.trim() || "Kiorly provider smoke test";
    const reference = `smoke-${randomUUID()}`;
    if (channel === "sms") {
      this.sms.refresh();
      return { channel, modes: providerModes().sms, result: await this.sms.send({ to, body, reference, tenantId: input.tenantId ?? null }) };
    }
    if (channel === "email") {
      const r = await this.email.send({ tenantId: input.tenantId ?? null, to, templateKey: "password_reset", variables: { name: "Test", link: "https://example.invalid/smoke", code: "000000" } });
      return { channel, modes: providerModes().email, result: r };
    }
    if (channel === "whatsapp") {
      if (!input.tenantId) throw new BadRequestException("tenantId is required for WhatsApp (market templates)");
      const r = await this.whatsappSend.sendTemplateForTenant(input.tenantId, input.templateKey ?? "appointment_reminder_whatsapp", to, { name: "Test", body }, { renderedBody: body, relatedId: reference });
      return { channel, modes: providerModes().whatsapp, result: r };
    }
    throw new BadRequestException("channel must be sms | email | whatsapp");
  }

  /** Refund a succeeded Kiorly payment and (mock) settle it through the signed refund webhook. */
  async simulatePspRefund(input: { paymentId: string; amount?: string }) {
    const payment = await this.prisma.kiorlyPayment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    const started = await this.payments.refundPaymentInternal(payment.id, input.amount);
    if (started.status !== "PENDING") return started;
    const gateway = this.gateways.get(payment.provider);
    if (!gateway?.signMockWebhook) return started;
    const key = `dev-refund-${randomUUID()}`;
    const amount = input.amount ?? payment.amount.toFixed(2);
    const payload =
      gateway.key === "paymob"
        ? { idempotency_key: key, type: "refund", transaction_id: payment.providerRef, success: true, amount, currency: payment.currency }
        : { requestId: key, fawryRefNumber: payment.providerRef, paymentAmount: amount, paymentCurrency: payment.currency, orderStatus: "REFUNDED" };
    const raw = JSON.stringify(payload);
    return { ...started, settled: await this.payments.handleWebhook(gateway.key, raw, gateway.signMockWebhook(raw), payload) };
  }
}
