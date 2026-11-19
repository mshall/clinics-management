import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { AppointmentStatus, MessageChannel, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { hoursUntil, resolveKiorexCancellationPolicy } from "../marketplace/kiorex-booking-policy";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { OutboxEventService, OUTBOX_TARGET_INTERNAL } from "./outbox-event.service";
import { AppointmentOutboxService } from "./appointment-outbox.service";
import { WaitlistAutofillService } from "./waitlist-autofill.service";
import {
  OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
  type WhatsAppReplyAction,
} from "./whatsapp-reply-payloads";

export type InboundWhatsAppButton = {
  providerMessageId: string;
  fromPhone: string;
  contextProviderMessageId?: string;
  payload: string;
};

@Injectable()
export class WhatsAppInboundRepliesService {
  private readonly log = new Logger(WhatsAppInboundRepliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxEventService,
    private readonly appointmentOutbox: AppointmentOutboxService,
    private readonly scheduling: SchedulingService,
    private readonly rescheduleTokens: AppointmentRescheduleTokenService,
    private readonly consent: MessagingConsentService,
    private readonly waitlist: WaitlistAutofillService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async handleButtonReply(msg: InboundWhatsAppButton, action: WhatsAppReplyAction): Promise<boolean> {
    const existing = await this.prisma.whatsAppInboundEvent.findUnique({
      where: { providerMessageId: msg.providerMessageId },
    });
    if (existing) return false;

    const contextId = msg.contextProviderMessageId?.trim();
    if (!contextId) return false;

    if (action === "waitlist_accept" || action === "waitlist_decline") {
      const outbound = await this.prisma.outboundMessage.findFirst({
        where: { providerMessageId: contextId },
        select: { tenantId: true },
      });
      if (!outbound) return false;
      if (!(await flagOn(this.flags, outbound.tenantId, "clinic.whatsapp_inbound"))) return false;
      await this.prisma.whatsAppInboundEvent.create({
        data: {
          tenantId: outbound.tenantId,
          providerMessageId: msg.providerMessageId,
          action,
          payloadJson: msg as unknown as Prisma.InputJsonValue,
        },
      });
      const res = await this.waitlist.handleReply(contextId, action);
      return res.handled;
    }

    const outbound = await this.prisma.outboundMessage.findFirst({
      where: { providerMessageId: contextId },
    });
    // clinic.whatsapp_inbound OFF: replies no longer change appointments; they are routed to the inbox.
    if (outbound && !(await flagOn(this.flags, outbound.tenantId, "clinic.whatsapp_inbound"))) return false;
    if (!outbound?.appointmentId) {
      this.log.debug(`Inbound WhatsApp reply without appointment context: ${contextId}`);
      return false;
    }

    const apt = await this.prisma.appointment.findFirst({
      where: { id: outbound.appointmentId, tenantId: outbound.tenantId },
      include: { patient: { select: { phone: true } } },
    });
    if (!apt) return false;

    const phoneNorm = msg.fromPhone.replace(/\D/g, "");
    const patientPhone = apt.patient.phone?.replace(/\D/g, "") ?? "";
    if (patientPhone && phoneNorm && !phoneNorm.endsWith(patientPhone.slice(-10))) {
      this.log.warn(`WhatsApp reply phone mismatch for appointment ${apt.id}`);
    }

    await this.prisma.whatsAppInboundEvent.create({
      data: {
        tenantId: outbound.tenantId,
        providerMessageId: msg.providerMessageId,
        appointmentId: apt.id,
        action,
        payloadJson: msg as unknown as Prisma.InputJsonValue,
      },
    });

    if (action === "confirm") {
      await this.confirmAppointment(outbound.tenantId, apt.id, apt.clinicId);
    } else if (action === "cancel") {
      await this.cancelAppointment(outbound.tenantId, apt.id, apt.clinicId);
    } else if (action === "reschedule") {
      await this.sendRescheduleLink(outbound.tenantId, apt.id, apt.patient.phone ?? msg.fromPhone);
    }

    return true;
  }

  private async confirmAppointment(tenantId: string, appointmentId: string, clinicId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
      if (!apt || apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) return;
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CONFIRMED,
          whatsappConfirmedAt: apt.whatsappConfirmedAt ?? now,
        },
      });
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId,
          clinicId,
          previousStatus: apt.status,
          nextStatus: AppointmentStatus.CONFIRMED,
          bookingSource: apt.bookingSource,
        },
        tx,
      );
      await this.outbox.enqueue(
        tenantId,
        OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
        { appointmentId, clinicId, action: "confirm", channel: "whatsapp" },
        tx,
        OUTBOX_TARGET_INTERNAL,
      );
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: null,
      clinicId,
      action: "WHATSAPP_APPOINTMENT_CONFIRMED",
      resource: "Appointment",
      resourceId: appointmentId,
      metadata: { source: "whatsapp_inbound" },
    });
  }

  /** FS-04 — a late patient cancellation keeps the deposit, per the clinic policy (`depositRefundMinHours`). */
  private async patientDepositRefundable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clinicId: string,
    startsAt: Date,
    now: Date,
  ): Promise<boolean> {
    const clinic = await tx.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: { kiorexCancellationPolicy: true, tenant: { select: { market: { select: { commercialConfig: true } } } } },
    });
    const policy = resolveKiorexCancellationPolicy(clinic?.tenant.market?.commercialConfig, clinic?.kiorexCancellationPolicy);
    return hoursUntil(startsAt, now) >= policy.depositRefundMinHours;
  }

  private async cancelAppointment(tenantId: string, appointmentId: string, clinicId: string): Promise<void> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
      if (!apt || apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
        return null;
      }
      const now = new Date();
      const row = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: "PATIENT",
          depositRefundable: await this.patientDepositRefundable(tx, tenantId, clinicId, apt.startsAt, now),
        },
      });
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId,
          clinicId,
          previousStatus: apt.status,
          nextStatus: AppointmentStatus.CANCELLED,
          bookingSource: apt.bookingSource,
          cancelledByPatient: true,
        },
        tx,
      );
      await this.outbox.enqueue(
        tenantId,
        OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
        { appointmentId, clinicId, action: "cancel", channel: "whatsapp" },
        tx,
        OUTBOX_TARGET_INTERNAL,
      );
      return row;
    });
    if (!updated) return;

    const freed = await this.scheduling.recordFreedSlot(tenantId, appointmentId);

    await this.audit.recordEvent({
      tenantId,
      actorId: null,
      clinicId,
      action: "WHATSAPP_APPOINTMENT_CANCELLED",
      resource: "Appointment",
      resourceId: appointmentId,
      metadata: { source: "whatsapp_inbound", waitlistSlotId: freed?.slotId ?? null },
    });
  }

  private async sendRescheduleLink(tenantId: string, appointmentId: string, toPhone: string): Promise<void> {
    const token = await this.rescheduleTokens.mintForAppointment(tenantId, appointmentId);
    const url = this.rescheduleTokens.rescheduleUrl(token);
    const variables = { link: url };
    const bodyPreview = `Reschedule your visit: ${url}`;
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { patientId: true },
    });
    if (apt) {
      try {
        await this.consent.assertCanSend(tenantId, apt.patientId, MessageChannel.WHATSAPP, "appointment_reschedule_link");
      } catch {
        this.log.warn(`Reschedule link suppressed — transactional WhatsApp consent off for patient ${apt.patientId}`);
        return;
      }
    }
    await this.prisma.outboundMessage.create({
      data: {
        tenantId,
        appointmentId,
        channel: "WHATSAPP",
        templateKey: "appointment_reschedule_link",
        toPhone: toPhone.trim(),
        body: bodyPreview,
        variablesJson: variables,
        status: "QUEUED",
      },
    });
    await this.outbox.enqueue(
      tenantId,
      OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
      {
        appointmentId,
        action: "reschedule_link_queued",
        channel: "whatsapp",
      },
      undefined,
      OUTBOX_TARGET_INTERNAL,
    );
  }
}