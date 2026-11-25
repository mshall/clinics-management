import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SupportService } from "../support/support.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { WhatsAppAiReceptionistService } from "./whatsapp-ai-receptionist.service";
import { replyActionFromPayload } from "./whatsapp-reply-payloads";
import { isMessagingOptOutKeyword } from "../patients/messaging-consent.constants";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { windowOpen as windowOpenFn } from "./meta-cloud-events";
import { classifyMetaCode, failureClassForAction, parseMetaAccountEvents } from "./meta-cloud-events";

/** Normalize digits for comparing Meta display phone numbers to KIORLY_SUPPORT_WHATSAPP_NUMBER. */
function phoneDigits(value: string | undefined | null): string {
  return (value ?? "").replace(/\D/g, "");
}

@Injectable()
export class WhatsAppWebhookService {
  private readonly log = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inboundReplies: WhatsAppInboundRepliesService,
    private readonly messagingConsent: MessagingConsentService,
    private readonly support: SupportService,
    private readonly aiReceptionist: WhatsAppAiReceptionistService,
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

  async handlePayload(
    body: unknown,
  ): Promise<{ processed: number; replies: number; optOuts: number; supportTickets: number; aiReceptionist: number }> {
    const entries = Array.isArray((body as { entry?: unknown }).entry) ? (body as { entry: unknown[] }).entry : [];
    let processed = 0;
    let replies = 0;
    let optOuts = 0;
    let supportTickets = 0;
    let aiReceptionist = 0;
    const supportLine = phoneDigits(process.env.KIORLY_SUPPORT_WHATSAPP_NUMBER);
    await this.recordAccountEvents(body);
    for (const entry of entries) {
      const changes = Array.isArray((entry as { changes?: unknown }).changes)
        ? (entry as { changes: unknown[] }).changes
        : [];
      for (const change of changes) {
        const value = (change as { value?: unknown }).value as {
          statuses?: unknown[];
          messages?: unknown[];
          metadata?: { display_phone_number?: string; phone_number_id?: string };
        } | undefined;
        const messages = Array.isArray(value?.messages) ? value!.messages! : [];
        const displayPhone = phoneDigits(value?.metadata?.display_phone_number);
        for (const message of messages) {
          await this.touchWindow(value?.metadata?.phone_number_id, (message as { from?: string; timestamp?: string }).from, (message as { timestamp?: string }).timestamp);
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
          // GT-04: free-text to the Kiorly support WhatsApp number → support ticket
          const toSupportLine =
            !!supportLine &&
            (displayPhone === supportLine ||
              displayPhone.endsWith(supportLine) ||
              supportLine.endsWith(displayPhone));
          if (toSupportLine && m.type === "text" && m.id && m.text?.body) {
            const res = await this.support.createFromWhatsAppInbound({
              providerMessageId: m.id,
              fromPhone: m.from ?? "",
              text: m.text.body,
            });
            if (res.created) supportTickets += 1;
            continue;
          }
          // MS-06: free-text to clinic WhatsApp → AI receptionist (Egyptian Arabic)
          if (!toSupportLine && m.type === "text" && m.id && m.text?.body) {
            const ai = await this.aiReceptionist.handleInboundText({
              fromPhone: m.from ?? "",
              text: m.text.body,
              providerMessageId: m.id,
            });
            if (ai?.handled) {
              aiReceptionist += 1;
              processed += 1;
              continue;
            }
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
            const code = errs?.[0]?.code;
            data.failureClass = classifyMetaCode(code) !== "UNKNOWN" ? failureClassForAction(classifyMetaCode(code)).failureClass : /template|1320/i.test(data.error) ? "TEMPLATE" : "POLICY";
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
    return { processed, replies, optOuts, supportTickets, aiReceptionist };
  }

  /** The customer wrote to us: the 24 h window is open from this moment. Never moves backwards (a delayed, replayed webhook cannot shrink it). */
  async touchWindow(phoneNumberId: string | undefined, from: string | undefined, timestampSeconds: string | undefined): Promise<void> {
    const phone = phoneDigits(from);
    if (!phoneNumberId || !phone) return;
    const at = new Date(Math.min(Number(timestampSeconds) * 1000 || Date.now(), Date.now()));
    const key = { phoneNumberId_phone: { phoneNumberId, phone } };
    await this.prisma.whatsAppContactWindow.upsert({ where: key, create: { phoneNumberId, phone, lastInboundAt: at }, update: {} });
    await this.prisma.whatsAppContactWindow.updateMany({ where: { phoneNumberId, phone, lastInboundAt: { lt: at } }, data: { lastInboundAt: at } });
  }

  /** Is the free-form window open for this customer now? (`hours` default 24). */
  async windowOpen(phoneNumberId: string, toPhone: string, now = Date.now(), hours = 24): Promise<boolean> {
    const row = await this.prisma.whatsAppContactWindow.findUnique({ where: { phoneNumberId_phone: { phoneNumberId, phone: phoneDigits(toPhone) } } });
    return !!row && windowOpenFn(row.lastInboundAt.getTime(), now, hours);
  }

  /** Template review, quality, tier and account events: stored by name and state, logged as warnings when something needs a human. */
  async recordAccountEvents(body: unknown): Promise<number> {
    let n = 0;
    for (const e of parseMetaAccountEvents(body)) {
      const detail = e.type === "TEMPLATE_STATUS" ? e.reason ?? null : e.type === "PHONE_QUALITY" ? e.tier ?? null : e.type === "TEMPLATE_QUALITY" ? e.quality : null;
      await this.prisma.whatsAppChannelEvent.create({ data: { kind: e.type, name: "name" in e ? e.name.slice(0, 200) : null, language: "language" in e ? e.language : null, event: e.type === "TEMPLATE_QUALITY" ? "QUALITY" : e.event, detail } });
      if ((e.type === "TEMPLATE_STATUS" && ["REJECTED", "PAUSED", "DISABLED", "FLAGGED"].includes(e.event)) || (e.type === "PHONE_QUALITY" && ["FLAGGED", "DOWNGRADE"].includes(e.event)) || e.type === "ACCOUNT") this.log.warn(`WhatsApp account event ${e.type} ${"event" in e ? e.event : ""} (see WhatsAppChannelEvent)`);
      n++;
    }
    return n;
  }
}
