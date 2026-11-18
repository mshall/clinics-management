import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  BookingSource,
  MessageChannel,
  Prisma,
} from "@prisma/client";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import { CONSENT_PURPOSE_MARKETPLACE } from "../compliance/consent-policy.constants";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_COMMERCIAL_CONFIG } from "../markets/commercial-config.schema";
import { mapEffectiveAppointmentType } from "../scheduling/appointment-type-rules";
import { appointmentIntervalsOverlap } from "../common/appointment-scheduling";
import { MESSAGING_CONSENT_TRANSACTIONAL } from "../patients/messaging-consent.constants";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { addMinutes, effectiveAppointmentEnd } from "../common/appointment-scheduling";
import { DEFAULT_SLOT_HOLD_MINUTES, MARKETPLACE_BOOKING_CONFIRM_TIMEOUT_TOPIC, SLOT_TAKEN_CODE } from "./marketplace-booking.constants";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplacePatientIntakeService, type MarketplacePatientInput } from "./marketplace-patient-intake.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

export type MarketplaceBookingBody = {
  clinicId: string;
  clinicianId: string;
  typeId: string;
  startsAt: string;
  endsAt?: string;
  holdId?: string;
  holdExternalRef?: string;
  patient: MarketplacePatientInput;
  notes?: string;
  marketplaceConsentGranted?: boolean;
  remindersConsentGranted?: boolean;
  attribution?: Record<string, unknown>;
};

@Injectable()
export class MarketplaceBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MarketplaceAccessService,
    private readonly patients: MarketplacePatientIntakeService,
    private readonly appointments: AppointmentsService,
    private readonly consent: ConsentPolicyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxEventService,
    private readonly appointmentOutbox: AppointmentOutboxService,
    private readonly slots: SlotService,
  ) {}

  async getByExternalRef(client: PlatformIntegrationPrincipal, externalRef: string) {
    const row = await this.prisma.appointment.findFirst({
      where: {
        platformIntegrationClientId: client.id,
        externalReference: externalRef.trim(),
      },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
      },
    });
    if (!row) throw new NotFoundException("Booking not found");
    return this.serializeBooking(row);
  }

  async createBooking(
    client: PlatformIntegrationPrincipal,
    idempotencyKey: string,
    body: MarketplaceBookingBody,
  ) {
    const key = idempotencyKey?.trim() || "";
    if (!key) throw new BadRequestException("Idempotency-Key header is required");

    const existing = await this.prisma.appointment.findFirst({
      where: { platformIntegrationClientId: client.id, externalReference: key },
    });
    if (existing) {
      return this.serializeBooking(existing);
    }

    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    const start = new Date(body.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    const typeRow = await this.prisma.appointmentType.findFirst({
      where: { id: body.typeId, tenantId, clinicId: body.clinicId, isActive: true, marketplaceBookable: true },
    });
    if (!typeRow) throw new BadRequestException("Invalid marketplace appointment type");
    const override = await this.prisma.clinicianAppointmentTypeOverride.findFirst({
      where: { tenantId, clinicianId: body.clinicianId, appointmentTypeId: body.typeId },
    });
    const effective = mapEffectiveAppointmentType(typeRow, override);
    const end = body.endsAt ? new Date(body.endsAt) : addMinutes(start, effective.durationMinutes);
    if (Number.isNaN(end.getTime()) || end <= start) throw new BadRequestException("Invalid endsAt");

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: body.clinicId, tenantId },
      select: { marketplaceBookingAutoConfirm: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const patientId = await this.patients.resolveOrCreate(tenantId, body.clinicId, body.patient);

    if (body.marketplaceConsentGranted !== false) {
      await this.consent.capture(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, {
        granted: true,
        source: "kiorex_booking",
      });
    }
    await this.consent.require(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE);

    if (body.remindersConsentGranted) {
      await this.prisma.messagingConsent.upsert({
        where: {
          patientId_channel_purpose: {
            patientId,
            channel: MessageChannel.WHATSAPP,
            purpose: MESSAGING_CONSENT_TRANSACTIONAL,
          },
        },
        create: {
          tenantId,
          patientId,
          channel: MessageChannel.WHATSAPP,
          purpose: MESSAGING_CONSENT_TRANSACTIONAL,
          granted: true,
          source: "kiorex_booking",
        },
        update: { granted: true, source: "kiorex_booking" },
      });
    }

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
        const lockKey = BigInt(Math.abs(body.clinicianId.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + start.getTime()));
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        const now = new Date();
        await tx.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });

        const hold = body.holdId
          ? await tx.slotHold.findFirst({
              where: {
                id: body.holdId,
                platformIntegrationClientId: client.id,
                expiresAt: { gt: now },
              },
            })
          : body.holdExternalRef
            ? await tx.slotHold.findFirst({
                where: {
                  externalRef: body.holdExternalRef.trim(),
                  platformIntegrationClientId: client.id,
                  expiresAt: { gt: now },
                },
              })
            : null;

        if (hold && (hold.startsAt.getTime() !== start.getTime() || hold.clinicianId !== body.clinicianId)) {
          throw new BadRequestException("Hold does not match booking slot");
        }

        const sameDay = await tx.appointment.findMany({
          where: {
            tenantId,
            clinicianId: body.clinicianId,
            status: { notIn: [AppointmentStatus.CANCELLED] },
            startsAt: { gte: addMinutes(start, -24 * 60), lte: addMinutes(end, 24 * 60) },
          },
        });
        const conflicting = sameDay.find((a) =>
          appointmentIntervalsOverlap(
            start,
            end,
            a.startsAt,
            effectiveAppointmentEnd(a.startsAt, a.endsAt),
          ),
        );
        const conflictingHold = await tx.slotHold.findFirst({
          where: {
            clinicianId: body.clinicianId,
            startsAt: start,
            expiresAt: { gt: now },
            ...(hold ? { NOT: { id: hold.id } } : {}),
          },
        });
        if (conflicting || conflictingHold) {
          throw new ConflictException({ code: SLOT_TAKEN_CODE, message: "Slot already taken" });
        }

        const confirmHours = DEFAULT_COMMERCIAL_CONFIG.kiorex.autoConfirmHours;
        const autoConfirm = clinic.marketplaceBookingAutoConfirm;
        const status = autoConfirm ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED;
        const confirmationDueAt = autoConfirm
          ? null
          : addMinutes(new Date(), confirmHours * 60);

        const appt = await tx.appointment.create({
          data: {
            tenantId,
            clinicId: body.clinicId,
            patientId,
            clinicianId: body.clinicianId,
            appointmentTypeId: body.typeId,
            startsAt: start,
            endsAt: end,
            feeAmount: typeRow.feeAmount,
            status,
            bookingSource: BookingSource.KIOREX_MARKETPLACE,
            attributionJson: (body.attribution ?? undefined) as Prisma.InputJsonValue | undefined,
            platformIntegrationClientId: client.id,
            externalReference: key,
            marketplaceConfirmationDueAt: confirmationDueAt,
            notes: body.notes ?? null,
          },
        });

        if (hold) await tx.slotHold.delete({ where: { id: hold.id } });

        if (status === AppointmentStatus.CONFIRMED) {
          await this.appointmentOutbox.emitStatusChange(
            {
              tenantId,
              appointmentId: appt.id,
              clinicId: appt.clinicId,
              previousStatus: AppointmentStatus.SCHEDULED,
              nextStatus: status,
              bookingSource: appt.bookingSource,
            },
            tx,
          );
        }

        return appt;
      },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.slots.invalidateAndNotify(tenantId, body.clinicId, body.clinicianId, "marketplace_booking");
      await this.audit.recordEvent({
        tenantId,
        actorId: null,
        clinicId: body.clinicId,
        action: "marketplace.booking.created",
        resource: "Appointment",
        resourceId: created.id,
        metadata: { externalReference: key, platformClientId: client.id },
      });

      return this.serializeBooking(created);
    } catch (e) {
      if (e instanceof ConflictException && (e.getResponse() as { code?: string })?.code === SLOT_TAKEN_CODE) {
        const alternatives = await this.nearestAlternatives(tenantId, body);
        throw new ConflictException({
          code: SLOT_TAKEN_CODE,
          message: "Slot already taken",
          alternatives,
        });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.prisma.appointment.findFirst({
          where: { platformIntegrationClientId: client.id, externalReference: key },
        });
        if (again) return this.serializeBooking(again);
      }
      throw e;
    }
  }

  async processConfirmationTimeouts(batch = 50): Promise<number> {
    const now = new Date();
    const rows = await this.prisma.appointment.findMany({
      where: {
        bookingSource: BookingSource.KIOREX_MARKETPLACE,
        status: AppointmentStatus.SCHEDULED,
        marketplaceConfirmationDueAt: { lte: now },
      },
      take: batch,
      select: {
        id: true,
        tenantId: true,
        clinicId: true,
        externalReference: true,
        platformIntegrationClientId: true,
      },
    });
    for (const row of rows) {
      await this.prisma.appointment.update({
        where: { id: row.id },
        data: { status: AppointmentStatus.CANCELLED, marketplaceConfirmationDueAt: null },
      });
      await this.outbox.enqueue(row.tenantId, MARKETPLACE_BOOKING_CONFIRM_TIMEOUT_TOPIC, {
        appointmentId: row.id,
        clinicId: row.clinicId,
        externalReference: row.externalReference,
        platformIntegrationClientId: row.platformIntegrationClientId,
      });
    }
    return rows.length;
  }

  private async nearestAlternatives(tenantId: string, body: MarketplaceBookingBody) {
    const target = new Date(body.startsAt).getTime();
    const from = addMinutes(new Date(body.startsAt), -12 * 60);
    const to = addMinutes(new Date(body.startsAt), 14 * 24 * 60);
    const { slots } = await this.slots.getSlots({
      tenantId,
      clinicId: body.clinicId,
      clinicianId: body.clinicianId,
      typeId: body.typeId,
      from,
      to,
      channel: SLOT_CHANNEL.MARKETPLACE,
    });
    return [...slots]
      .sort((a, b) => Math.abs(new Date(a.startsAt).getTime() - target) - Math.abs(new Date(b.startsAt).getTime() - target))
      .slice(0, 3);
  }

  private serializeBooking(row: {
    id: string;
    clinicId: string;
    clinicianId: string;
    patientId: string;
    appointmentTypeId: string | null;
    startsAt: Date;
    endsAt: Date | null;
    status: AppointmentStatus;
    externalReference: string | null;
    bookingSource: BookingSource;
    marketplaceConfirmationDueAt: Date | null;
  }) {
    return {
      appointmentId: row.id,
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      patientId: row.patientId,
      typeId: row.appointmentTypeId,
      startsAt: row.startsAt.toISOString(),
      endsAt: (row.endsAt ? effectiveAppointmentEnd(row.startsAt, row.endsAt) : row.endsAt)?.toISOString() ?? null,
      status: row.status,
      externalReference: row.externalReference,
      bookingSource: row.bookingSource,
      marketplaceConfirmationDueAt: row.marketplaceConfirmationDueAt?.toISOString() ?? null,
    };
  }
}