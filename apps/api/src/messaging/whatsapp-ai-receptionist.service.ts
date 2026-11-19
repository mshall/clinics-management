import { Injectable, Logger } from "@nestjs/common";
import { MessageChannel, Prisma, ReceptionistIntent } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { MessagingService } from "./messaging.service";
import {
  classifyReceptionistIntent,
  clinicalHandoverReplyAr,
  staffHandoverReplyAr,
  unknownReplyAr,
  type ReceptionistIntentKind,
} from "./whatsapp-ai-receptionist";

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

@Injectable()
export class WhatsAppAiReceptionistService {
  private readonly log = new Logger(WhatsAppAiReceptionistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  /** Resolve tenant from a known patient phone, else most recent outbound to that phone. */
  async resolveTenantId(fromPhone: string): Promise<string | null> {
    const d = digits(fromPhone);
    if (d.length < 8) return null;
    const patient = await this.prisma.patient.findFirst({
      where: { phone: { contains: d.slice(-9) } },
      select: { tenantId: true },
      orderBy: { createdAt: "desc" },
    });
    if (patient) return patient.tenantId;
    const outbound = await this.prisma.outboundMessage.findFirst({
      where: { toPhone: { contains: d.slice(-9) } },
      select: { tenantId: true },
      orderBy: { createdAt: "desc" },
    });
    return outbound?.tenantId ?? null;
  }

  async handleInboundText(input: {
    fromPhone: string;
    text: string;
    providerMessageId?: string;
    tenantId?: string;
  }): Promise<{ handled: boolean; intent: ReceptionistIntentKind; handedOver: boolean; replyText: string } | null> {
    if (input.providerMessageId) {
      const dup = await this.prisma.whatsAppReceptionistTurn.findUnique({
        where: { providerMessageId: input.providerMessageId },
      });
      if (dup) return null;
    }

    const tenantId = input.tenantId ?? (await this.resolveTenantId(input.fromPhone));
    if (!tenantId) return null;
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) {
      return null;
    }
    // Launch-locked: OFF until gate evidence (Meta approval + consent copy) arrives; inbound goes to the human inbox.
    if (!(await this.featureFlags.isEnabled(tenantId, "clinic.whatsapp_ai_receptionist"))) {
      return null;
    }

    const intent = classifyReceptionistIntent(input.text);
    const clinic = await this.prisma.clinic.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        addressAr: true,
        addressEn: true,
        locationUrl: true,
        phone: true,
        openingTime: true,
        closingTime: true,
        defaultCurrency: true,
      },
    });

    let replyText: string;
    let handedOver = false;
    const meta: Record<string, unknown> = { intent };

    switch (intent) {
      case "CLINICAL":
        replyText = clinicalHandoverReplyAr();
        handedOver = true;
        break;
      case "HANDOVER":
        replyText = staffHandoverReplyAr();
        handedOver = true;
        break;
      case "HOURS":
        replyText = clinic
          ? `مواعيد ${clinic.nameAr || clinic.nameEn}: من ${clinic.openingTime} لـ ${clinic.closingTime}.`
          : "مواعيد العمل مش متاحة دلوقتي — هحوّلك للاستقبال.";
        if (!clinic) handedOver = true;
        break;
      case "LOCATION":
        replyText = clinic
          ? `عنوان ${clinic.nameAr || clinic.nameEn}: ${clinic.addressAr || clinic.addressEn}. الخريطة: ${clinic.locationUrl}`
          : "العنوان مش متاح — هحوّلك للاستقبال.";
        if (!clinic) handedOver = true;
        break;
      case "PRICES": {
        const types = clinic
          ? await this.prisma.appointmentType.findMany({
              where: { tenantId, clinicId: clinic.id, isActive: true },
              take: 5,
              orderBy: { nameEn: "asc" },
              select: { nameAr: true, nameEn: true, feeAmount: true },
            })
          : [];
        if (!types.length) {
          replyText = "الأسعار مش ظاهرة دلوقتي — هحوّلك لموظف الاستقبال.";
          handedOver = true;
        } else {
          const lines = types.map(
            (t) =>
              `• ${t.nameAr || t.nameEn}: ${t.feeAmount != null ? `${Number(t.feeAmount)} ${clinic?.defaultCurrency ?? "EGP"}` : "حسب الكشف"}`,
          );
          replyText = `أسعار العيادة:\n${lines.join("\n")}\nلو محتاج تفاصيل أكتر قولّي.`;
        }
        break;
      }
      case "BOOKING":
      case "RESCHEDULE": {
        replyText = await this.bookingOrRescheduleReply(tenantId, clinic?.id, intent);
        if (intent === "RESCHEDULE") {
          replyText += "\nلتغيير موعد قائم هحوّلك للاستقبال لو محتاج مساعدة.";
        }
        break;
      }
      default:
        replyText = unknownReplyAr();
        break;
    }

    const turn = await this.prisma.whatsAppReceptionistTurn.create({
      data: {
        tenantId,
        clinicId: clinic?.id ?? null,
        fromPhone: input.fromPhone,
        providerMessageId: input.providerMessageId ?? null,
        inboundText: input.text.slice(0, 4000),
        intent: intent as ReceptionistIntent,
        replyText,
        handedOver,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    try {
      await this.messaging.queueMessage(tenantId, {
        channel: MessageChannel.WHATSAPP,
        toPhone: input.fromPhone,
        body: replyText,
        templateKey: "ai_receptionist_reply",
        metadata: { kind: "ai_receptionist", turnId: turn.id, intent, handedOver },
      });
    } catch (e) {
      this.log.warn(`AI receptionist reply not queued: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { handled: true, intent, handedOver, replyText };
  }

  private async bookingOrRescheduleReply(
    tenantId: string,
    clinicId: string | undefined,
    intent: ReceptionistIntentKind,
  ): Promise<string> {
    if (!clinicId) {
      return "مش لاقي عيادة مربوطة — هحوّلك للاستقبال عشان يحجزوا لك.";
    }
    const type = await this.prisma.appointmentType.findFirst({
      where: { tenantId, clinicId, isActive: true },
      orderBy: { nameEn: "asc" },
    });
    const clinician = await this.prisma.user.findFirst({
      where: { tenantId, role: "PHYSICIAN", deactivatedAt: null, deletedAt: null },
      select: { id: true, displayName: true },
    });
    if (!type || !clinician) {
      return "الحجز محتاج تأكيد من الاستقبال — هحوّلك دلوقتي.";
    }
    const from = new Date();
    const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.slots.getSlots({
        tenantId,
        clinicId,
        clinicianId: clinician.id,
        typeId: type.id,
        from,
        to,
        channel: SLOT_CHANNEL.INTERNAL,
      });
      const next = result.slots.slice(0, 3);
      if (!next.length) {
        return intent === "BOOKING"
          ? "مفيش مواعيد فاضية قريبة في النظام. هحوّلك للاستقبال يحجزوا لك."
          : "مفيش مواعيد بديلة ظاهرة. هحوّلك للاستقبال.";
      }
      const lines = next.map((s) => `• ${new Date(s.startsAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}`);
      return (
        `أقدر أساعدك في ${intent === "BOOKING" ? "الحجز" : "تغيير الموعد"}. أقرب مواعيد مع ${clinician.displayName}:\n` +
        `${lines.join("\n")}\nابعت رقم الموعد اللي يناسبك أو اطلب تحويل للاستقبال.`
      );
    } catch (e) {
      this.log.warn(`slot lookup failed: ${e instanceof Error ? e.message : String(e)}`);
      return "ما قدرتش أجيب المواعيد دلوقتي — هحوّلك للاستقبال.";
    }
  }

  listInbox(tenantId: string, opts: { handedOverOnly?: boolean; limit?: number } = {}) {
    return this.prisma.whatsAppReceptionistTurn.findMany({
      where: {
        tenantId,
        ...(opts.handedOverOnly ? { handedOver: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 100,
    });
  }
}
