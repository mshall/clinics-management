import { BadRequestException, Injectable } from "@nestjs/common";
import { AppointmentQueueStage, AppointmentStatus, Prisma, type PrismaClient } from "@prisma/client";
import { parseFrontDeskRoomLabels } from "../common/front-desk-room-labels";
import { PrismaService } from "../prisma/prisma.service";
import { resolveExamRoomLabel } from "./front-desk-room-assign";

type Tx = Prisma.TransactionClient;

@Injectable()
export class FrontDeskFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async nextQueueTicket(tx: Tx, tenantId: string, clinicId: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const maxTicket = await tx.appointment.aggregate({
      where: {
        tenantId,
        clinicId,
        checkedInAt: { gte: dayStart, lt: dayEnd },
        queueTicketNumber: { not: null },
      },
      _max: { queueTicketNumber: true },
    });
    return (maxTicket._max.queueTicketNumber ?? 0) + 1;
  }

  /** Check-in queue: waiting area, no exam room occupancy yet. */
  applyCheckInQueueFields(input: {
    preferredRoomLabel?: string | null;
    existingPreferred?: string | null;
  }): Prisma.AppointmentUpdateInput {
    const preferred = input.preferredRoomLabel?.trim() || input.existingPreferred?.trim() || null;
    return {
      queueStage: AppointmentQueueStage.WAITING,
      roomLabel: null,
      roomAssignedAt: null,
      preferredRoomLabel: preferred,
    };
  }

  async markCalled(tx: Tx, appointmentId: string): Promise<void> {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { queueStage: AppointmentQueueStage.CALLED, calledAt: new Date() },
    });
  }

  /**
   * Ensures the appointment is checked in (issues ticket if needed) then assigns a free exam room.
   * Called when an encounter is opened for the visit.
   */
  async onEncounterStarted(
    tx: Tx,
    tenantId: string,
    appointmentId: string,
  ): Promise<{ roomLabel: string | null; queueStage: AppointmentQueueStage }> {
    const apt = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { clinic: { select: { frontDeskRoomLabels: true } } },
    });
    if (!apt) throw new BadRequestException("Appointment not found");

    if (apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot start visit for this appointment");
    }

    if (apt.queueStage === AppointmentQueueStage.IN_EXAM && apt.roomLabel) {
      return { roomLabel: apt.roomLabel, queueStage: AppointmentQueueStage.IN_EXAM };
    }

    const now = new Date();
    const checkInPatch: Prisma.AppointmentUpdateInput = {};
    if (apt.status !== AppointmentStatus.CHECKED_IN) {
      const ticket = await this.nextQueueTicket(tx, tenantId, apt.clinicId);
      checkInPatch.status = AppointmentStatus.CHECKED_IN;
      checkInPatch.checkedInAt = apt.checkedInAt ?? now;
      checkInPatch.queueTicketNumber = apt.queueTicketNumber ?? ticket;
      checkInPatch.queueStage = AppointmentQueueStage.WAITING;
    }

    const occupied = await this.occupiedExamRoomLabels(tx, tenantId, apt.clinicId, appointmentId);
    const clinicianDefault = await this.clinicianDefaultRoom(tx, tenantId, apt.clinicId, apt.clinicianId);
    const roomLabels = parseFrontDeskRoomLabels(apt.clinic.frontDeskRoomLabels);
    const roomLabel = resolveExamRoomLabel({
      roomLabels,
      occupiedLabels: occupied,
      preferred: apt.preferredRoomLabel,
      clinicianDefault,
    });

    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        ...checkInPatch,
        queueStage: AppointmentQueueStage.IN_EXAM,
        roomLabel,
        roomAssignedAt: roomLabel ? now : null,
      },
    });

    return { roomLabel, queueStage: AppointmentQueueStage.IN_EXAM };
  }

  /** Finalize encounter — release exam room; appointment completion is handled separately. */
  async onEncounterEnded(tx: Tx, appointmentId: string): Promise<void> {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        roomLabel: null,
        roomAssignedAt: null,
        queueStage: null,
      },
    });
  }

  /** Encounter deleted — return patient to waiting queue if appointment still active. */
  async onEncounterCancelled(tx: Tx, tenantId: string, appointmentId: string): Promise<void> {
    const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!apt) return;
    if (apt.status !== AppointmentStatus.CHECKED_IN) return;

    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        roomLabel: null,
        roomAssignedAt: null,
        queueStage: apt.calledAt ? AppointmentQueueStage.CALLED : AppointmentQueueStage.WAITING,
      },
    });
  }

  async occupiedExamRoomLabels(
    tx: Tx | PrismaClient,
    tenantId: string,
    clinicId: string,
    excludeAppointmentId?: string,
  ): Promise<Set<string>> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await tx.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        status: AppointmentStatus.CHECKED_IN,
        queueStage: AppointmentQueueStage.IN_EXAM,
        roomLabel: { not: null },
        checkedInAt: { gte: dayStart },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { roomLabel: true },
    });
    return new Set(rows.map((r) => r.roomLabel!).filter(Boolean));
  }

  private async clinicianDefaultRoom(
    tx: Tx | PrismaClient,
    tenantId: string,
    clinicId: string,
    clinicianUserId: string,
  ): Promise<string | null> {
    const emp = await tx.employee.findFirst({
      where: { tenantId, clinicId, userId: clinicianUserId, recordStatus: "ACTIVE" },
      select: { defaultExamRoomLabel: true },
    });
    return emp?.defaultExamRoomLabel?.trim() ?? null;
  }
}