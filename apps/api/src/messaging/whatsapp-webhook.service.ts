import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { replyActionFromPayload } from "./whatsapp-reply-payloads";
import { isMessagingOptOutKeyword } from "../patients/messaging-consent.constants";
import { MessagingConsentService } from "../patients/messaging-consent.service";

@Injectable()
export class WhatsAppWebhookService {
  private readonly log = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inboundReplies: WhatsAppInboundRepliesService,
    private readonly messagingConsent: MessagingConsentService,
  ) {}

  verifySubscribe(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
    if (mode === "subscribe" && expected && token === expected && challenge) return challenge;
    return null;
  }

  assertSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== "production";
    const provided = signatureHeader?.replace(/^sha256=/, "") ?? "";
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    try {
      const a = Buffer.from(digest, "hex");
      const b = Buffer.from(provided, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async handlePayload(body: unknown): Promise<{ processed: number; replies: number; optOuts: number }> {
    const entries = Array.isArray((body as { entry?: unknown }).entry) ? (body as { entry: unknown[] }).entry : [];
    let processed = 0;
    let replies = 0;
    let optOuts = 0;
    for (const entry of entries) {
      const changes = Array.isArray((entry as { changes?: unknown }).changes)
        ? (entry as { changes: unknown[] }).changes
        : [];
      for (const change of changes) {
        const value = (change as { value?: unknown }).value as {
          statuses?: unknown[];
          messages?: unknown[];
        } | undefined;
        const messages = Array.isArray(value?.messages) ? value!.messages! : [];
        for (const message of messages) {
          const m = message as {
            id?: string;
            from?: string;
            type?: string;
            button?: { payload?: string; text?: string };
            text?: { body?: string };
            context?: { id?: string };
          };
          if (m.type === "text" && m.text?.body && isMessagingOptOutKeyword(m.text.body)) {
            const n = await this.messagingConsent.revokeAllWhatsAppForPhone(m.from ?? "", "whatsapp_stop_keyword");
            if (n > 0) optOuts += n;
            continue;
          }
          if (m.type !== "button" || !m.button?.payload) continue;
          const action = replyActionFromPayload(m.button.payload);
          if (!action || !m.id) continue;
          const handled = await this.inboundReplies.handleButtonReply(
            {
              providerMessageId: m.id,
              fromPhone: m.from ?? "",
              contextProviderMessageId: m.context?.id,
              payload: m.button.payload,
            },
            action,
          );
          if (handled) replies += 1;
        }

        const statuses = Array.isArray(value?.statuses) ? value!.statuses! : [];
        for (const status of statuses) {
          const id = String((status as { id?: string }).id ?? "").trim();
          if (!id) continue;
          const state = String((status as { status?: string }).status ?? "").toLowerCase();
          const tsRaw = (status as { timestamp?: string }).timestamp;
          const ts = tsRaw ? new Date(Number(tsRaw) * 1000) : new Date();
          const row = await this.prisma.outboundMessage.findFirst({ where: { providerMessageId: id } });
          if (!row) continue;
          const data: {
            status?: string;
            deliveredAt?: Date;
            readAt?: Date;
            error?: string;
            failureClass?: string;
          } = {};
          if (state === "sent") data.status = "SENT";
          if (state === "delivered") {
            data.status = "DELIVERED";
            data.deliveredAt = ts;
          }
          if (state === "read") {
            data.status = "READ";
            data.readAt = ts;
            data.deliveredAt = row.deliveredAt ?? ts;
          }
          if (state === "failed") {
            data.status = "FAILED";
            const errs = (status as { errors?: { title?: string; message?: string; code?: number }[] }).errors;
            const detail = errs?.map((e) => e.message ?? e.title).filter(Boolean).join("; ");
            data.error = detail?.slice(0, 500) ?? "Provider reported failure";
            data.failureClass = /template|1320/i.test(data.error) ? "TEMPLATE" : "POLICY";
          }
          if (Object.keys(data).length) {
            await this.prisma.outboundMessage.update({ where: { id: row.id }, data });
            processed += 1;
            if (state === "failed") {
              await this.audit.recordEvent({
                tenantId: row.tenantId,
                actorId: null,
                clinicId: null,
                action: "WHATSAPP_DELIVERY_FAILED",
                resource: "OutboundMessage",
                resourceId: row.id,
                metadata: { providerMessageId: id, failureClass: data.failureClass, error: data.error },
              });
            }
          }
        }
      }
    }
    return { processed, replies, optOuts };
  }
}