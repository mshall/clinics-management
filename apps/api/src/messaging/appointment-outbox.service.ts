import { Injectable } from "@nestjs/common";
import { AppointmentStatus, BookingSource, Prisma } from "@prisma/client";
import { OutboxEventService } from "./outbox-event.service";
import { OUTBOX_EVENT } from "./outbox-event-types";
import { isReviewInvitationEligible } from "./review-invitation";
import { telehealthBlock } from "../telehealth/telehealth-events";

type Tx = Pick<Prisma.TransactionClient, "outboxEvent">;

/**
 * ADR-039: appointment events of a telehealth visit carry an additive `telehealth` block (sessionId, join URL, window), so Kiorex
 * keeps the same link after reschedule/cancel. Read through the caller's transaction (the session row is created in it).
 * Absent for in-person appointments and when no transaction client is supplied.
 */
async function telehealthPayload(tx: Tx | undefined, appointmentId: string): Promise<Record<string, unknown>> {
  const c = tx as Partial<Prisma.TransactionClient> | undefined;
  if (!c?.telehealthSession) return {};
  const s = await c.telehealthSession.findUnique({ where: { appointmentId }, include: { appointment: { select: { startsAt: true, endsAt: true } } } });
  return s ? { telehealth: telehealthBlock(s, s.appointment) } : {};
}

@Injectable()
export class AppointmentOutboxService {
  constructor(private readonly outbox: OutboxEventService) {}

  async emitStatusChange(
    params: {
      tenantId: string;
      appointmentId: string;
      clinicId: string;
      previousStatus: AppointmentStatus;
      nextStatus: AppointmentStatus;
      bookingSource: BookingSource;
      cancelledByPatient?: boolean;
      metadata?: Record<string, unknown>;
    },
    tx?: Tx,
  ): Promise<void> {
    const type = this.mapStatusToEvent(params);
    if (!type) return;
    await this.outbox.enqueueEvent(
      {
        tenantId: params.tenantId,
        type,
        aggregateType: "Appointment",
        aggregateId: params.appointmentId,
        payload: {
          appointmentId: params.appointmentId,
          clinicId: params.clinicId,
          previousStatus: params.previousStatus,
          nextStatus: params.nextStatus,
          bookingSource: params.bookingSource,
          ...params.metadata,
          ...(await telehealthPayload(tx, params.appointmentId)),
        },
      },
      tx,
    );
    if (params.previousStatus !== params.nextStatus && isReviewInvitationEligible(params.nextStatus, params.bookingSource)) {
      await this.outbox.enqueueEvent(
        {
          tenantId: params.tenantId,
          type: OUTBOX_EVENT.REVIEW_INVITATION_ELIGIBLE,
          aggregateType: "Appointment",
          aggregateId: params.appointmentId,
          payload: {
            appointmentId: params.appointmentId,
            clinicId: params.clinicId,
            bookingSource: params.bookingSource,
          },
        },
        tx,
      );
    }
  }

  private mapStatusToEvent(params: {
    nextStatus: AppointmentStatus;
    previousStatus: AppointmentStatus;
    cancelledByPatient?: boolean;
  }): string | null {
    if (params.nextStatus === AppointmentStatus.CONFIRMED && params.previousStatus !== AppointmentStatus.CONFIRMED) {
      return OUTBOX_EVENT.APPOINTMENT_CONFIRMED;
    }
    if (params.nextStatus === AppointmentStatus.CANCELLED) {
      return params.cancelledByPatient
        ? OUTBOX_EVENT.CANCELLED_BY_PATIENT
        : OUTBOX_EVENT.CANCELLED_BY_CLINIC;
    }
    if (params.nextStatus === AppointmentStatus.CHECKED_IN) return OUTBOX_EVENT.CHECKED_IN;
    const prev = params.previousStatus as AppointmentStatus;
    const next = params.nextStatus as AppointmentStatus;
    if (
      prev === AppointmentStatus.CHECKED_IN &&
      next !== AppointmentStatus.CHECKED_IN &&
      next !== AppointmentStatus.COMPLETED
    ) {
      return OUTBOX_EVENT.CHECK_IN_REVERTED;
    }
    if (params.nextStatus === AppointmentStatus.COMPLETED) return OUTBOX_EVENT.COMPLETED;
    if (params.nextStatus === AppointmentStatus.NO_SHOW) return OUTBOX_EVENT.NO_SHOW;
    return null;
  }

  async emitRescheduled(
    tenantId: string,
    appointmentId: string,
    clinicId: string,
    startsAt: string,
    tx?: Tx,
  ): Promise<void> {
    await this.outbox.enqueueEvent(
      {
        tenantId,
        type: OUTBOX_EVENT.APPOINTMENT_RESCHEDULED,
        aggregateType: "Appointment",
        aggregateId: appointmentId,
        payload: { appointmentId, clinicId, startsAt, ...(await telehealthPayload(tx, appointmentId)) },
      },
      tx,
    );
  }
}