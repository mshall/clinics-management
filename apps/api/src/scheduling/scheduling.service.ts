import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  AppointmentWaitlistStatus,
  LeaveStatus,
  Prisma,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { addMinutes, resolveCreateAppointmentEnd } from "../common/appointment-scheduling";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  listAppointmentTypes(tenantId: string, clinicId?: string) {
    return this.prisma.appointmentType.findMany({
      where: { tenantId, isActive: true, ...(clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : {}) },
      orderBy: { nameEn: "asc" },
    });
  }

  async upsertAppointmentType(tenantId: string, body: Record<string, unknown>) {
    const nameEn = String(body.nameEn ?? "").trim();
    if (!nameEn) throw new BadRequestException("nameEn required");
    const data = {
      nameEn,
      nameAr: String(body.nameAr ?? "").trim(),
      durationMinutes: Number(body.durationMinutes ?? 15),
      feeAmount: new Prisma.Decimal(String(body.feeAmount ?? 0)),
      colorHex: String(body.colorHex ?? "#3b82f6"),
      isActive: body.isActive !== false,
      clinicId: body.clinicId ? String(body.clinicId) : null,
    };
    if (body.id) {
      return this.prisma.appointmentType.update({ where: { id: String(body.id) }, data });
    }
    return this.prisma.appointmentType.create({ data: { tenantId, ...data } });
  }

  getAvailability(tenantId: string, clinicId: string, clinicianId: string) {
    return this.prisma.clinicianAvailabilityTemplate.findFirst({
      where: { tenantId, clinicId, clinicianId },
    });
  }

  upsertAvailability(
    tenantId: string,
    body: { clinicId: string; clinicianId: string; weekJson: unknown; blockedJson?: unknown },
  ) {
    return this.prisma.clinicianAvailabilityTemplate.upsert({
      where: { tenantId_clinicId_clinicianId: { tenantId, clinicId: body.clinicId, clinicianId: body.clinicianId } },
      create: {
        tenantId,
        clinicId: body.clinicId,
        clinicianId: body.clinicianId,
        weekJson: body.weekJson as Prisma.InputJsonValue,
        blockedJson: (body.blockedJson ?? []) as Prisma.InputJsonValue,
      },
      update: {
        weekJson: body.weekJson as Prisma.InputJsonValue,
        blockedJson: (body.blockedJson ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  async clinicianLeaveBlocks(tenantId: string, clinicianId: string, from: Date, to: Date) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId: clinicianId, deletedAt: null },
    });
    if (!employee) return [];
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: LeaveStatus.APPROVED,
        startDate: { lte: to },
        endDate: { gte: from },
      },
    });
    return leaves.map((l) => ({
      type: l.type,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      reason: l.reason,
    }));
  }

  listWaitlist(tenantId: string, clinicId?: string) {
    return this.prisma.appointmentWaitlistEntry.findMany({
      where: {
        tenantId,
        status: { in: [AppointmentWaitlistStatus.WAITING, AppointmentWaitlistStatus.OFFERED] },
        ...(clinicId ? { clinicId } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } } },
    });
  }

  createWaitlist(
    tenantId: string,
    body: {
      clinicId: string;
      patientId: string;
      clinicianId?: string;
      appointmentTypeId?: string;
      preferredFrom?: string;
      preferredTo?: string;
      notes?: string;
    },
  ) {
    return this.prisma.appointmentWaitlistEntry.create({
      data: {
        tenantId,
        clinicId: body.clinicId,
        patientId: body.patientId,
        clinicianId: body.clinicianId ?? null,
        appointmentTypeId: body.appointmentTypeId ?? null,
        preferredFrom: body.preferredFrom ? new Date(body.preferredFrom) : null,
        preferredTo: body.preferredTo ? new Date(body.preferredTo) : null,
        notes: body.notes?.trim() ?? null,
      },
    });
  }

  async createSeries(
    tenantId: string,
    body: {
      clinicId: string;
      patientId: string;
      clinicianId: string;
      appointmentTypeId?: string;
      label: string;
      totalSessions: number;
      packagePaidAmount?: number;
      cadenceDays?: number;
      startsOn: string;
    },
  ) {
    const total = Math.min(Math.max(body.totalSessions, 1), 52);
    const cadence = body.cadenceDays ?? 7;
    const type = body.appointmentTypeId
      ? await this.prisma.appointmentType.findFirst({ where: { id: body.appointmentTypeId, tenantId } })
      : null;
    const duration = type?.durationMinutes ?? 15;
    const fee = type ? Number(type.feeAmount) : 0;

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.appointmentSeries.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          clinicianId: body.clinicianId,
          appointmentTypeId: body.appointmentTypeId ?? null,
          label: body.label.trim(),
          totalSessions: total,
          packagePaidAmount: new Prisma.Decimal(String(body.packagePaidAmount ?? 0)),
          cadenceDays: cadence,
          startsOn: new Date(body.startsOn),
        },
      });
      const startBase = new Date(body.startsOn);
      for (let i = 0; i < total; i++) {
        const start = new Date(startBase);
        start.setDate(start.getDate() + i * cadence);
        const end = addMinutes(start, duration);
        await tx.appointment.create({
          data: {
            tenantId,
            clinicId: body.clinicId,
            patientId: body.patientId,
            clinicianId: body.clinicianId,
            appointmentTypeId: body.appointmentTypeId ?? null,
            seriesId: series.id,
            startsAt: start,
            endsAt: end,
            feeAmount: new Prisma.Decimal(String(fee)),
            recurrenceIndex: i + 1,
            status: AppointmentStatus.SCHEDULED,
          },
        });
      }
      return series;
    });
  }

  async markNoShow(tenantId: string, appointmentId: string) {
    const apt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!apt) throw new NotFoundException("Appointment not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.NO_SHOW, noShowAt: new Date() },
      });
      const patient = await tx.patient.update({
        where: { id: apt.patientId },
        data: { noShowCount: { increment: 1 } },
      });
      if (patient.noShowCount >= 3) {
        await tx.patient.update({
          where: { id: apt.patientId },
          data: { requiresAppointmentDeposit: true },
        });
      }
    });
    return { ok: true };
  }

  async offerWaitlistForCancelledSlot(tenantId: string, clinicId: string, slotAt: Date, clinicianId?: string) {
    const entry = await this.prisma.appointmentWaitlistEntry.findFirst({
      where: {
        tenantId,
        clinicId,
        status: AppointmentWaitlistStatus.WAITING,
        ...(clinicianId ? { OR: [{ clinicianId }, { clinicianId: null }] } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    if (!entry) return null;
    return this.prisma.appointmentWaitlistEntry.update({
      where: { id: entry.id },
      data: { status: AppointmentWaitlistStatus.OFFERED, offeredSlotAt: slotAt },
    });
  }

  resolveDurationFromType(type: { durationMinutes: number } | null | undefined, endsAtRaw?: string | null, start?: Date) {
    if (endsAtRaw?.trim()) return resolveCreateAppointmentEnd(start!, endsAtRaw);
    const mins = type?.durationMinutes ?? 15;
    return addMinutes(start!, mins);
  }
}
