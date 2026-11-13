import { Injectable } from "@nestjs/common";
import { MessageChannel, RecallCampaignKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
    key: "appointment_reminder_2h",
    channel: MessageChannel.SMS,
    bodyEn: "Your visit is in 2 hours at {{clinic}}.",
    bodyAr: "موعدكم بعد ساعتين في {{clinic}}.",
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
  constructor(private readonly prisma: PrismaService) {}

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

  async queueMessage(tenantId: string, body: { patientId?: string; channel: MessageChannel; toPhone: string; templateKey?: string; body: string }) {
    return this.prisma.outboundMessage.create({
      data: {
        tenantId,
        patientId: body.patientId,
        channel: body.channel,
        templateKey: body.templateKey,
        toPhone: body.toPhone.trim(),
        body: body.body,
        status: "QUEUED",
      },
    });
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
