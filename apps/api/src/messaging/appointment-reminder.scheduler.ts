import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppointmentStatus, MessageChannel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "./messaging.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";

const SCAN_MS = 60_000;
const WINDOW_MINUTES = 30;

@Injectable()
export class AppointmentReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AppointmentReminderScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.scan().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Enqueue WhatsApp reminder asynchronously (non-blocking). */
  scheduleRemindersForTenant(tenantId: string): void {
    setImmediate(() => {
      void this.scanTenant(tenantId).catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    });
  }

  private async scan(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { whatsAppRemindersEnabled: true },
      select: { id: true, appointmentReminderHoursBefore: true },
    });
    for (const t of tenants) {
      await this.scanTenant(t.id, t.appointmentReminderHoursBefore);
    }
  }

  private async scanTenant(tenantId: string, hoursBefore?: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { whatsAppRemindersEnabled: true, appointmentReminderHoursBefore: true },
    });
    if (!tenant || !(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return;

    const hours = hoursBefore ?? tenant.appointmentReminderHoursBefore ?? 24;
    const targetStart = new Date(Date.now() + hours * 3600_000);
    const targetEnd = new Date(targetStart.getTime() + WINDOW_MINUTES * 60_000);

    await this.messaging.ensureDefaultTemplates(tenantId);
    const marketCtx = await resolveMarketForTenant(this.prisma, tenantId);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.SCHEDULED] },
        startsAt: { gte: targetStart, lt: targetEnd },
        patient: { phone: { not: "" } },
      },
      include: {
        patient: { select: { id: true, phone: true, firstNameEn: true, lastNameEn: true } },
        clinic: { select: { nameEn: true, nameAr: true, timezone: true } },
      },
      take: 50,
    });

    for (const apt of appointments) {
      const phone = apt.patient.phone?.trim();
      if (!phone) continue;
      const existing = await this.prisma.outboundMessage.findFirst({
        where: {
          tenantId,
          appointmentId: apt.id,
          templateKey: "appointment_reminder_whatsapp",
          channel: MessageChannel.WHATSAPP,
        },
      });
      if (existing) continue;

      const tpl = await this.prisma.messageTemplate.findFirst({
        where: {
          tenantId,
          key: "appointment_reminder_whatsapp",
          channel: MessageChannel.WHATSAPP,
          active: true,
        },
      });
      const bodyTemplate =
        tpl?.bodyEn ??
        "Reminder: appointment on {{time}} at {{clinic}}. Reply CONFIRM or CANCEL.";
      const timeZone = apt.clinic.timezone?.trim() || marketCtx.timezone;
      const when = apt.startsAt.toLocaleString("en-EG", { timeZone });
      const name = `${apt.patient.firstNameEn} ${apt.patient.lastNameEn}`.trim();
      const body = bodyTemplate
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{clinic\}\}/g, apt.clinic.nameEn)
        .replace(/\{\{time\}\}/g, when);

      await this.prisma.outboundMessage.create({
        data: {
          tenantId,
          patientId: apt.patient.id,
          appointmentId: apt.id,
          channel: MessageChannel.WHATSAPP,
          templateKey: "appointment_reminder_whatsapp",
          toPhone: phone,
          body,
          status: "QUEUED",
          metadata: { hoursBefore: hours, scheduledStart: apt.startsAt.toISOString() },
        },
      });
    }
  }
}