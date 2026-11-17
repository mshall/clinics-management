import { Injectable, Logger } from "@nestjs/common";
import { AppointmentStatus, MessageChannel, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { OutboxEventService } from "./outbox-event.service";
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
    private readonly scheduling: SchedulingService,
    private readonly rescheduleTokens: AppointmentRescheduleTokenService,
    private readonly consent: MessagingConsentService,
  ) {}

  async handleButtonReply(msg: InboundWhatsAppButton, action: WhatsAppReplyAction): Promise<boolean> {
    const existing = await this.prisma.whatsAppInboundEvent.findUnique({
      where: { providerMessageId: msg.providerMessageId },
    });
    if (existing) return false;

    const contextId = msg.contextProviderMessageId?.trim();
    if (!contextId) return false;

    const outbound = await this.prisma.outboundMessage.findFirst({
      where: { providerMessageId: contextId },
    });
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
      await this.cancelAppointment(outbound.tenantId, apt.id, apt.clinicId, apt.startsAt, apt.clinicianId);
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
      await this.outbox.enqueue(
        tenantId,
        OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
        { appointmentId, clinicId, action: "confirm", channel: "whatsapp" },
        tx,
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

  private async cancelAppointment(
    tenantId: string,
    appointmentId: string,
    clinicId: string,
    startsAt: Date,
    clinicianId: string,
  ): Promise<void> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
      if (!apt || apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
        return null;
      }
      const row = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CANCELLED },
      });
      await this.outbox.enqueue(
        tenantId,
        OUTBOX_TOPIC_FRONT_DESK_WHATSAPP,
        { appointmentId, clinicId, action: "cancel", channel: "whatsapp" },
        tx,
      );
      return row;
    });
    if (!updated) return;

    await this.scheduling.offerWaitlistForCancelledSlot(tenantId, clinicId, startsAt, clinicianId);

    await this.audit.recordEvent({
      tenantId,
      actorId: null,
      clinicId,
      action: "WHATSAPP_APPOINTMENT_CANCELLED",
      resource: "Appointment",
      resourceId: appointmentId,
      metadata: { source: "whatsapp_inbound", waitlistOffered: true },
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
    await this.outbox.enqueue(tenantId, OUTBOX_TOPIC_FRONT_DESK_WHATSAPP, {
      appointmentId,
      action: "reschedule_link_queued",
      channel: "whatsapp",
    });
  }
}