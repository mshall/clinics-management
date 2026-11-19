import { BadRequestException, Injectable } from "@nestjs/common";
import { MessageChannel, Prisma, RecallCampaignKind } from "@prisma/client";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { resolveMarketTemplate, whatsAppConfigFromMarket } from "./whatsapp-market-config";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { UsageMeterService } from "../usage/usage-meter.service";

const DEFAULT_TEMPLATES: { key: string; channel: MessageChannel; bodyEn: string; bodyAr: string }[] = [
  {
    key: "appointment_confirm",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Hello {{name}}, your appointment at {{clinic}} is confirmed for {{time}}.",
    bodyAr: "مرحباً {{name}}، تم تأكيد موعدك في {{clinic}} الساعة {{time}}.",
  },
  {
    key: "appointment_reminder_24h",
    channel: MessageChannel.SMS,
    bodyEn: "Reminder: appointment tomorrow at {{time}}. Reply CONFIRM or CANCEL.",
    bodyAr: "تذكير: موعدكم غداً {{time}}. أرسل تأكيد أو إلغاء.",
  },
  {
    key: "appointment_reminder_whatsapp",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Hello {{name}}, this is a reminder from {{clinic}}: your appointment is on {{time}}.",
    bodyAr: "مرحباً {{name}}، تذكير من {{clinic}}: موعدكم {{time}}.",
  },
  {
    key: "appointment_reminder_2h",
    channel: MessageChannel.SMS,
    bodyEn: "Your visit is in 2 hours at {{clinic}}.",
    bodyAr: "موعدكم بعد ساعتين في {{clinic}}.",
  },
  {
    key: "deposit_payment_link",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Hello {{name}}, please pay a deposit of {{amount}} to keep your appointment at {{clinic}}: {{link}} (within {{hours}} hours).",
    bodyAr: "مرحباً {{name}}، يرجى دفع عربون {{amount}} لتأكيد موعدك في {{clinic}}: {{link}} (خلال {{hours}} ساعة).",
  },
  {
    key: "owner_shift_summary",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "{{clinic}} shift Z#{{z}} closed: expected cash {{expected}}, counted {{counted}}, variance {{variance}}; card {{card}}. Status: {{status}}.",
    bodyAr: "تم إغلاق وردية {{clinic}} رقم Z#{{z}}: النقدية المتوقعة {{expected}}، المعدودة {{counted}}، الفرق {{variance}}؛ البطاقات {{card}}. الحالة: {{status}}.",
  },
  {
    key: "results_ready",
    channel: MessageChannel.WHATSAPP,
    bodyEn: "Your lab results are ready. Please contact {{clinic}}.",
    bodyAr: "نتائج التحاليل جاهزة. يرجى التواصل مع {{clinic}}.",
  },
];

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: MessagingConsentService,
    private readonly usage: UsageMeterService,
  ) {}

  async ensureDefaultTemplates(tenantId: string) {
    for (const t of DEFAULT_TEMPLATES) {
      await this.prisma.messageTemplate.upsert({
        where: { tenantId_key_channel: { tenantId, key: t.key, channel: t.channel } },
        create: { tenantId, key: t.key, channel: t.channel, bodyEn: t.bodyEn, bodyAr: t.bodyAr },
        update: {},
      });
    }
  }

  async listTemplates(tenantId: string) {
    await this.ensureDefaultTemplates(tenantId);
    return this.prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: [{ key: "asc" }, { channel: "asc" }] });
  }

  async queueMessage(
    tenantId: string,
    body: {
      patientId?: string;
      appointmentId?: string;
      channel: MessageChannel;
      toPhone: string;
      templateKey?: string;
      body: string;
      variables?: Record<string, string>;
      metadata?: Record<string, unknown>;
    },
  ) {
    if (body.channel === MessageChannel.WHATSAPP && !body.templateKey?.trim()) {
      throw new BadRequestException("WhatsApp messages require an approved templateKey");
    }
    if (body.channel === MessageChannel.WHATSAPP) {
      await this.usage.assertWhatsAppQuota(tenantId);
    }
    await this.consent.assertCanSend(tenantId, body.patientId, body.channel, body.templateKey);
    const ctx = await resolveMarketForTenant(this.prisma, tenantId);
    const wa = whatsAppConfigFromMarket(ctx.providerConfig);
    const marketTpl = body.templateKey ? resolveMarketTemplate(wa, body.templateKey) : null;
    return this.prisma.outboundMessage.create({
      data: {
        tenantId,
        patientId: body.patientId,
        appointmentId: body.appointmentId,
        channel: body.channel,
        templateKey: body.templateKey,
        templateName: marketTpl?.name ?? null,
        variablesJson: body.variables ? (body.variables as Prisma.InputJsonValue) : undefined,
        toPhone: body.toPhone.trim(),
        body: body.body,
        metadata: body.metadata ? (body.metadata as Prisma.InputJsonValue) : undefined,
        status: "QUEUED",
      },
    });
  }

  listOutbound(
    tenantId: string,
    filter: { patientId?: string; appointmentId?: string; limit?: number },
  ) {
    const take = Math.min(50, filter.limit ?? 20);
    return this.prisma.outboundMessage.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.appointmentId ? { appointmentId: filter.appointmentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  listFailures(tenantId: string, take = 50) {
    return this.prisma.outboundMessage.findMany({
      where: {
        tenantId,
        channel: MessageChannel.WHATSAPP,
        status: { in: ["FAILED", "RETRY"] },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, take),
    });
  }

  /**
   * Recall / marketing outreach — requires MARKETING consent (MS-03).
   */
  async queueRecallCampaignMessage(
    tenantId: string,
    body: {
      patientId: string;
      channel: MessageChannel;
      toPhone: string;
      templateKey: string;
      body: string;
      variables?: Record<string, string>;
    },
  ) {
    const key = body.templateKey?.trim();
    if (!key.startsWith("recall_")) {
      throw new BadRequestException("Recall campaigns require a recall_* templateKey");
    }
    await this.consent.assertCanSend(tenantId, body.patientId, body.channel, key);
    return this.queueMessage(tenantId, { ...body, templateKey: key });
  }

  async listRecallCampaigns(tenantId: string) {
    const count = await this.prisma.recallCampaign.count({ where: { tenantId } });
    if (count === 0) {
      await this.prisma.recallCampaign.createMany({
        data: [
          { tenantId, kind: RecallCampaignKind.CHECKUP_DUE, nameEn: "Annual check-up due", nameAr: "موعد الفحص السنوي" },
          { tenantId, kind: RecallCampaignKind.LAPSED, nameEn: "Lapsed patients", nameAr: "مرضى غير نشطين" },
          { tenantId, kind: RecallCampaignKind.BIRTHDAY, nameEn: "Birthday outreach", nameAr: "تهنئة بأعياد الميلاد" },
        ],
      });
    }
    return this.prisma.recallCampaign.findMany({ where: { tenantId, active: true } });
  }
}
