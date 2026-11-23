import { Injectable, Logger } from "@nestjs/common";
import { AppointmentStatus, MessageChannel, Prisma, ServiceLocation, TelehealthSessionStatus } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { resolveMarketTemplate } from "../messaging/whatsapp-market-config";
import { whatsAppConfigFromMarket } from "../messaging/whatsapp-market-config";
import { MESSAGING_CONSENT_TRANSACTIONAL } from "../patients/messaging-consent.constants";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { PrismaService } from "../prisma/prisma.service";
import { dueNotifications, telehealthMessageBody, TELEHEALTH_TEMPLATE_KEY, type ReminderState, type TelehealthMessageKind } from "./telehealth-messages";
import { patientJoinUrl } from "./telehealth-token";

/**
 * Telehealth notifications (ADR-039). Link on creation / regenerate, "moved to ..." on time edits, reminders 24 h and 15 min before.
 * Dedupe is per linkVersion and per start time (state in TelehealthSession.reminderState), so edits re-arm reminders and a regenerated
 * link re-sends. Channels follow the organisation's settings: WhatsApp only when the org enabled it, the flag is on, the patient consented
 * and the market has an approved template for the key (TODO_NEEDS_HUMAN: template names); otherwise SMS; email additionally when the patient has one.
 */
@Injectable()
export class TelehealthNotifier {
  private readonly log = new Logger(TelehealthNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: MessagingConsentService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Called after a create/regenerate/edit (and by the tick as a safety net). Idempotent. */
  async sessionChanged(sessionId: string, now = new Date()): Promise<TelehealthMessageKind[]> {
    const s = await this.load(sessionId);
    if (!s || !this.notifiable(s)) return [];
    const state = (s.reminderState as ReminderState | null) ?? {};
    const { kinds, next } = dueNotifications(now, { linkVersion: s.linkVersion, startsAt: s.appointment.startsAt, state });
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    if (changed) {
      // claim first (updateMany on the previous state) so two instances cannot both send
      const claim = await this.prisma.telehealthSession.updateMany({
        where: { id: s.id, updatedAt: s.updatedAt },
        data: { reminderState: next as unknown as Prisma.InputJsonValue },
      });
      if (claim.count !== 1) return [];
    }
    for (const k of kinds) await this.send(s, k);
    return kinds;
  }

  async sendDueReminders(now = new Date()): Promise<number> {
    const rows = await this.prisma.telehealthSession.findMany({
      where: {
        status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING] },
        appointment: { status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] }, startsAt: { gte: new Date(now.getTime() - 60 * 60_000), lte: new Date(now.getTime() + 25 * 3600_000) } },
      },
      select: { id: true },
      take: 200,
    });
    let n = 0;
    for (const r of rows) n += (await this.sessionChanged(r.id, now).catch(() => [])).length;
    return n;
  }

  /** In-app notice for the doctor when the patient is waiting. */
  async patientJoined(sessionId: string): Promise<void> {
    const s = await this.prisma.telehealthSession.findUnique({ where: { id: sessionId }, include: { appointment: { select: { patient: { select: { firstNameEn: true } } } } } });
    if (!s) return;
    await this.prisma.staffInAppNotice.create({
      data: {
        tenantId: s.tenantId, userId: s.clinicianUserId, kind: "TELEHEALTH_PATIENT_WAITING",
        titleEn: "Patient is waiting", titleAr: "المريض في الانتظار",
        bodyEn: `${s.appointment.patient.firstNameEn} joined the video visit.`, bodyAr: `${s.appointment.patient.firstNameEn} انضم إلى زيارة الفيديو.`,
        metadata: { sessionId: s.id, appointmentId: s.appointmentId },
      },
    });
  }

  private async load(id: string) {
    return this.prisma.telehealthSession.findUnique({
      where: { id },
      include: {
        appointment: {
          select: {
            id: true, startsAt: true, endsAt: true, status: true, serviceLocation: true,
            patient: { select: { id: true, phone: true, email: true, firstNameEn: true, lastNameEn: true, isSample: true } },
            clinic: { select: { nameEn: true, nameAr: true, timezone: true } },
            clinician: { select: { displayName: true } },
          },
        },
        tenant: { select: { whatsAppRemindersEnabled: true } },
      },
    });
  }

  private notifiable(s: NonNullable<Awaited<ReturnType<TelehealthNotifier["load"]>>>): boolean {
    return (
      (s.status === TelehealthSessionStatus.SCHEDULED || s.status === TelehealthSessionStatus.WAITING) &&
      s.appointment.serviceLocation === ServiceLocation.VIDEO &&
      (s.appointment.status === AppointmentStatus.SCHEDULED || s.appointment.status === AppointmentStatus.CONFIRMED) &&
      !s.appointment.patient.isSample
    );
  }

  private async send(s: NonNullable<Awaited<ReturnType<TelehealthNotifier["load"]>>>, kind: TelehealthMessageKind): Promise<void> {
    const p = s.appointment.patient;
    const ctx = await resolveMarketForTenant(this.prisma, s.tenantId);
    const lang: "en" | "ar" = String((ctx as { locale?: string }).locale ?? "ar").startsWith("en") ? "en" : "ar";
    const tz = s.appointment.clinic.timezone?.trim() || ctx.timezone;
    const when = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(s.appointment.startsAt);
    const variables = { name: p.firstNameEn, clinic: lang === "ar" ? s.appointment.clinic.nameAr || s.appointment.clinic.nameEn : s.appointment.clinic.nameEn, doctor: s.appointment.clinician.displayName, time: when, link: patientJoinUrl(s) };
    const body = telehealthMessageBody(kind, lang, variables);
    const templateKey = TELEHEALTH_TEMPLATE_KEY[kind];
    const metadata = { telehealth: true, kind, linkVersion: s.linkVersion, startsAt: s.appointment.startsAt.toISOString() };
    // the link is a bearer secret: it is stored only in the message row the patient is sent (never in logs)
    const channels: { channel: MessageChannel; to: string }[] = [];
    const phone = p.phone?.trim();
    if (phone) {
      const waCfg = whatsAppConfigFromMarket(ctx.providerConfig);
      const waOk =
        s.tenant.whatsAppRemindersEnabled && (await this.flags.isEnabled(s.tenantId, "whatsapp_reminders")) && resolveMarketTemplate(waCfg, templateKey) != null &&
        (await this.consent.isGranted(s.tenantId, p.id, MessageChannel.WHATSAPP, MESSAGING_CONSENT_TRANSACTIONAL));
      if (waOk) channels.push({ channel: MessageChannel.WHATSAPP, to: phone });
      else if (await this.consent.isGranted(s.tenantId, p.id, MessageChannel.SMS, MESSAGING_CONSENT_TRANSACTIONAL)) channels.push({ channel: MessageChannel.SMS, to: phone });
    }
    const email = p.email?.trim();
    if (email && (await this.consent.isGranted(s.tenantId, p.id, MessageChannel.EMAIL, MESSAGING_CONSENT_TRANSACTIONAL))) channels.push({ channel: MessageChannel.EMAIL, to: email });
    for (const c of channels) {
      try {
        await this.prisma.outboundMessage.create({
          data: { tenantId: s.tenantId, patientId: p.id, appointmentId: s.appointmentId, channel: c.channel, templateKey, toPhone: c.to, body, variablesJson: variables, status: "QUEUED", metadata },
        });
      } catch (e) {
        this.log.warn(`telehealth ${kind} not queued (${c.channel}): ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }
}
