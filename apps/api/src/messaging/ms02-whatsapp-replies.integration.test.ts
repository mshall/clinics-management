import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  AppointmentWaitlistStatus,
  MessageChannel,
  PrismaClient,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { OutboxEventService } from "./outbox-event.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { WHATSAPP_REPLY_CANCEL, WHATSAPP_REPLY_CONFIRM } from "./whatsapp-reply-payloads";

const prisma = new PrismaClient();

function webhookService(): WhatsAppWebhookService {
  const prismaSvc = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaSvc);
  const outbox = new OutboxEventService(prismaSvc);
  const scheduling = new SchedulingService(prismaSvc);
  const tokens = new AppointmentRescheduleTokenService(prismaSvc);
  const consent = new MessagingConsentService(prismaSvc, audit, new ConsentPolicyService(prismaSvc, audit));
  const inbound = new WhatsAppInboundRepliesService(prismaSvc, audit, outbox, scheduling, tokens, consent);
  return new WhatsAppWebhookService(prismaSvc, audit, inbound, consent);
}

describe("MS-02 WhatsApp inbound replies", () => {
  const ids: {
    tenantId?: string;
    patientId?: string;
    waitPatientId?: string;
    appointmentId?: string;
    outboundId?: string;
    waitlistId?: string;
  } = {};

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const tenant = { id: clinic.tenantId };
    const clinician = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true },
    });
    ids.tenantId = tenant.id;
    const patient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        mrn: `MS02-${Date.now()}`,
        firstNameEn: "Wa",
        lastNameEn: "Reply",
        gender: "UNKNOWN",
        phone: "+201099988877",
      },
    });
    ids.patientId = patient.id;
    const waitPatient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        mrn: `MS02-WL-${Date.now()}`,
        firstNameEn: "Wait",
        lastNameEn: "List",
        gender: "UNKNOWN",
        phone: "+201011122233",
      },
    });
    ids.waitPatientId = waitPatient.id;
    const startsAt = new Date(Date.now() + 86_400_000);
    const apt = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        clinicId: clinic.id,
        patientId: patient.id,
        clinicianId: clinician.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: AppointmentStatus.SCHEDULED,
      },
    });
    ids.appointmentId = apt.id;
    const providerMessageId = `wamid.ms02.${Date.now()}`;
    const outbound = await prisma.outboundMessage.create({
      data: {
        tenantId: tenant.id,
        appointmentId: apt.id,
        patientId: patient.id,
        channel: MessageChannel.WHATSAPP,
        templateKey: "appointment_reminder_whatsapp",
        toPhone: patient.phone ?? "+201099988877",
        body: "reminder",
        status: "DELIVERED",
        providerMessageId,
        sentAt: new Date(),
      },
    });
    ids.outboundId = outbound.id;
    const waitlist = await prisma.appointmentWaitlistEntry.create({
      data: {
        tenantId: tenant.id,
        clinicId: clinic.id,
        patientId: waitPatient.id,
        clinicianId: clinician.id,
        status: AppointmentWaitlistStatus.WAITING,
      },
    });
    ids.waitlistId = waitlist.id;
  });

  after(async () => {
    if (ids.waitlistId) await prisma.appointmentWaitlistEntry.delete({ where: { id: ids.waitlistId } }).catch(() => undefined);
    if (ids.outboundId) await prisma.outboundMessage.delete({ where: { id: ids.outboundId } }).catch(() => undefined);
    if (ids.appointmentId) {
      await prisma.whatsAppInboundEvent.deleteMany({ where: { appointmentId: ids.appointmentId } }).catch(() => undefined);
      await prisma.outboxEvent.deleteMany({ where: { tenantId: ids.tenantId, topic: "front_desk.appointment_whatsapp_reply" } }).catch(() => undefined);
      await prisma.appointmentRescheduleToken.deleteMany({ where: { appointmentId: ids.appointmentId } }).catch(() => undefined);
      await prisma.appointment.delete({ where: { id: ids.appointmentId } }).catch(() => undefined);
    }
    if (ids.patientId) await prisma.patient.delete({ where: { id: ids.patientId } }).catch(() => undefined);
    if (ids.waitPatientId) await prisma.patient.delete({ where: { id: ids.waitPatientId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("cancel reply frees slot and offers waitlist (FS-03)", async () => {
    const outbound = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: ids.outboundId! } });
    const webhook = webhookService();
    const inboundId = `wamid.inbound.cancel.${Date.now()}`;
    const aptBefore = await prisma.appointment.findUniqueOrThrow({ where: { id: ids.appointmentId! } });
    const result = await webhook.handlePayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: inboundId,
                    from: "201099988877",
                    type: "button",
                    button: { payload: WHATSAPP_REPLY_CANCEL, text: "Cancel" },
                    context: { id: outbound.providerMessageId },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(result.replies, 1);
    const apt = await prisma.appointment.findUniqueOrThrow({ where: { id: ids.appointmentId! } });
    assert.equal(apt.status, AppointmentStatus.CANCELLED);
    const wl = await prisma.appointmentWaitlistEntry.findUniqueOrThrow({ where: { id: ids.waitlistId! } });
    assert.equal(wl.status, AppointmentWaitlistStatus.OFFERED);
    assert.ok(wl.offeredSlotAt);
    assert.equal(wl.offeredSlotAt!.toISOString(), aptBefore.startsAt.toISOString());
    const outbox = await prisma.outboxEvent.findFirst({
      where: { tenantId: ids.tenantId!, topic: "front_desk.appointment_whatsapp_reply" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(outbox);
  });

  it("confirm reply sets whatsappConfirmedAt and CONFIRMED status", async () => {
    const tenantId = ids.tenantId!;
    const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId } });
    const clinician = await prisma.user.findFirstOrThrow({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `MS02-C-${Date.now()}`,
        firstNameEn: "Confirm",
        lastNameEn: "Test",
        gender: "UNKNOWN",
        phone: "+201088877766",
      },
    });
    const startsAt = new Date(Date.now() + 172_800_000);
    const apt = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId: clinic.id,
        patientId: patient.id,
        clinicianId: clinician.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: AppointmentStatus.SCHEDULED,
      },
    });
    const providerMessageId = `wamid.ms02.confirm.${Date.now()}`;
    await prisma.outboundMessage.create({
      data: {
        tenantId,
        appointmentId: apt.id,
        channel: MessageChannel.WHATSAPP,
        templateKey: "appointment_reminder_whatsapp",
        toPhone: patient.phone ?? "",
        body: "reminder",
        status: "DELIVERED",
        providerMessageId,
      },
    });
    const webhook = webhookService();
    await webhook.handlePayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: `wamid.inbound.confirm.${Date.now()}`,
                    from: "201088877766",
                    type: "button",
                    button: { payload: WHATSAPP_REPLY_CONFIRM, text: "Confirm" },
                    context: { id: providerMessageId },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: apt.id } });
    assert.equal(updated.status, AppointmentStatus.CONFIRMED);
    assert.ok(updated.whatsappConfirmedAt);
    await prisma.whatsAppInboundEvent.deleteMany({ where: { appointmentId: apt.id } });
    await prisma.outboundMessage.deleteMany({ where: { appointmentId: apt.id } });
    await prisma.appointment.delete({ where: { id: apt.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
  });
});