import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MessageChannel, Prisma } from "@prisma/client";
import { isMock } from "../common/provider-mode";
import { PrismaService } from "../prisma/prisma.service";
import { DevInboxRecorder } from "./dev-inbox.recorder";
import { nextRetryAt, workerStatusForFailure } from "./whatsapp-failure-policy";
import { resolveMarketTemplate, whatsAppConfigFromMarket } from "./whatsapp-market-config";
import { DEFAULT_REMINDER_QUICK_REPLIES, WAITLIST_OFFER_QUICK_REPLIES, WAITLIST_OFFER_TEMPLATE_KEY } from "./whatsapp-reply-payloads";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { WhatsAppSendService } from "./whatsapp-send.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { UsageMeterService } from "../usage/usage-meter.service";
import { UsageMetric } from "@prisma/client";

const POLL_MS = 15_000;
const BATCH = 25;

@Injectable()
export class OutboundMessageWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboundMessageWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppSendService,
    private readonly consent: MessagingConsentService,
    private readonly usage: UsageMeterService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.processBatch().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processBatch(): Promise<void> {
    const now = new Date();
    const rows = await this.prisma.outboundMessage.findMany({
      where: {
        status: { in: ["QUEUED", "RETRY"] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    for (const row of rows) {
      if (row.patientId && (await this.consent.isSamplePatient(row.tenantId, row.patientId))) {
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: { status: "FAILED", failureClass: "POLICY", error: "Sample patient — messages are never sent" },
        });
        continue;
      }
      if (row.channel === MessageChannel.WHATSAPP) {
        await this.processWhatsApp(row);
      } else if (isMock(row.channel === MessageChannel.EMAIL ? "email" : "sms")) {
        // Mock mode (default): "send" into the dev inbox with a deterministic provider id.
        const providerMessageId = `dev-sms-${row.id}`;
        await DevInboxRecorder.record({
          channel: row.channel === MessageChannel.EMAIL ? "EMAIL" : "SMS",
          tenantId: row.tenantId,
          toAddress: row.toPhone,
          templateKey: row.templateKey,
          bodyText: row.body,
          variables: (row.variablesJson as Record<string, unknown> | null) ?? null,
          providerMessageId,
          relatedId: row.id,
        });
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(), providerMessageId, error: null, failureClass: null },
        });
      } else {
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: { status: "FAILED", sentAt: new Date(), error: "Provider not configured", failureClass: "POLICY" },
        });
      }
    }
  }

  private async processWhatsApp(row: {
    id: string;
    tenantId: string;
    patientId: string | null;
    templateKey: string | null;
    templateName: string | null;
    variablesJson: unknown;
    toPhone: string;
    body: string;
    attemptCount: number;
    metadata: unknown;
  }): Promise<void> {
    if (row.patientId) {
      try {
        await this.consent.assertCanSend(row.tenantId, row.patientId, MessageChannel.WHATSAPP, row.templateKey);
      } catch {
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            failureClass: "CONSENT",
            error: "Patient messaging consent not granted",
          },
        });
        return;
      }
    }
    if (!row.templateKey?.trim()) {
      await this.prisma.outboundMessage.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          failureClass: "POLICY",
          error: "WhatsApp outbound requires templateKey (no free-form outside 24h window)",
        },
      });
      return;
    }
    const variables = this.whatsapp.buildVariablesForOutbound(row.templateKey, row.variablesJson, row.body);
    const ctx = await resolveMarketForTenant(this.prisma, row.tenantId);
    const waConfig = whatsAppConfigFromMarket(ctx.providerConfig);
    const marketTpl = resolveMarketTemplate(waConfig, row.templateKey);
    const attempt = row.attemptCount + 1;
    const quickReplies =
      row.templateKey === "appointment_reminder_whatsapp"
        ? marketTpl?.quickReplyButtons ?? [...DEFAULT_REMINDER_QUICK_REPLIES]
        : row.templateKey === WAITLIST_OFFER_TEMPLATE_KEY
          ? marketTpl?.quickReplyButtons ?? [...WAITLIST_OFFER_QUICK_REPLIES]
          : marketTpl?.quickReplyButtons;
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const result = await this.whatsapp.sendTemplateForTenant(row.tenantId, row.templateKey, row.toPhone, variables, {
      quickReplies,
      documentLink: typeof meta.documentLink === "string" ? meta.documentLink : undefined,
      documentFilename: typeof meta.documentFilename === "string" ? meta.documentFilename : undefined,
      renderedBody: row.body,
      relatedId: row.id,
    });
    if (result.ok) {
      await this.prisma.outboundMessage.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          templateName: marketTpl?.name ?? row.templateName,
          variablesJson: variables as unknown as Prisma.InputJsonValue,
          attemptCount: attempt,
          error: null,
          failureClass: null,
          nextRetryAt: null,
        },
      });
      await this.usage.incrementOnce(row.tenantId, UsageMetric.WHATSAPP_MESSAGES, `outbound:${row.id}`);
      return;
    }
    const status = workerStatusForFailure(result.retryable, attempt);
    await this.prisma.outboundMessage.update({
      where: { id: row.id },
      data: {
        status,
        attemptCount: attempt,
        error: result.error,
        failureClass: result.failureClass,
        nextRetryAt: status === "RETRY" ? nextRetryAt(attempt) : null,
      },
    });
  }
}