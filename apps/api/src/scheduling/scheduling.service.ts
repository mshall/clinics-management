import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicianVerificationService } from "../clinician-verification/clinician-verification.service";
import {
  AppointmentStatus,
  AppointmentWaitlistStatus,
  LeaveStatus,
  Prisma,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { addMinutes, resolveCreateAppointmentEnd } from "../common/appointment-scheduling";
import { PrismaService } from "../prisma/prisma.service";
import {
  mapEffectiveAppointmentType,
  patchAppointmentTypeData,
  schedulingBlockWithBuffers,
  type EffectiveAppointmentType,
} from "./appointment-type-rules";
import { normalizeWeekJson, parseAndValidateWeekJson, parseBlockedJson } from "./availability-week-schema";
import { resolveClinicTimezone } from "./clinic-scheduling-timezone";
import { SlotService } from "./slot.service";

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicianVerification: ClinicianVerificationService,
    private readonly slots: SlotService,
  ) {}

  listAppointmentTypes(tenantId: string, clinicId?: string) {
    return this.prisma.appointmentType.findMany({
      where: { tenantId, isActive: true, ...(clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : {}) },
      orderBy: { nameEn: "asc" },
    });
  }

  async upsertAppointmentType(tenantId: string, body: Record<string, unknown>) {
    const nameEn = String(body.nameEn ?? "").trim();
    if (!nameEn) throw new BadRequestException("nameEn required");
    const marketplaceBookable = Boolean(body.marketplaceBookable);
    if (marketplaceBookable) {
      await this.clinicianVerification.assertTenantCanEnableKiorexMarketplace(tenantId);
    }
    const data = {
      nameEn,
      nameAr: String(body.nameAr ?? "").trim(),
      durationMinutes: Number(body.durationMinutes ?? 15),
      feeAmount: new Prisma.Decimal(String(body.feeAmount ?? 0)),
      colorHex: String(body.colorHex ?? "#3b82f6"),
      isActive: body.isActive !== false,
      clinicId: body.clinicId ? String(body.clinicId) : null,
      bufferBeforeMin: Number(body.bufferBeforeMin ?? 0),
      bufferAfterMin: Number(body.bufferAfterMin ?? 0),
      requiresRoom: Boolean(body.requiresRoom),
      marketplaceBookable,
      minNoticeMinutes: Number(body.minNoticeMinutes ?? 120),
      maxDaysAhead: Number(body.maxDaysAhead ?? 30),
      newPatientOnly: Boolean(body.newPatientOnly),
      depositAmount:
        body.depositAmount != null && body.depositAmount !== ""
          ? new Prisma.Decimal(String(body.depositAmount))
          : null,
    };
    if (body.id) {
      const existing = await this.prisma.appointmentType.findFirst({
        where: { id: String(body.id), tenantId },
      });
      if (!existing) throw new NotFoundException("Appointment type not found");
      return this.prisma.appointmentType.update({ where: { id: existing.id }, data });
    }
    return this.prisma.appointmentType.create({ data: { tenantId, ...data } });
  }

  async patchAppointmentType(tenantId: string, typeId: string, body: Record<string, unknown>) {
    const existing = await this.prisma.appointmentType.findFirst({ where: { id: typeId, tenantId } });
    if (!existing) throw new NotFoundException("Appointment type not found");
    if (body.marketplaceBookable === true && !existing.marketplaceBookable) {
      await this.clinicianVerification.assertTenantCanEnableKiorexMarketplace(tenantId);
    }
    const data = patchAppointmentTypeData(body);
    if (Object.keys(data).length === 0) throw new BadRequestException("No fields to update");
    return this.prisma.appointmentType.update({ where: { id: typeId }, data });
  }

  async resolveEffectiveAppointmentType(
    tenantId: string,
    appointmentTypeId: string,
    clinicianId: string,
  ): Promise<EffectiveAppointmentType> {
    const type = await this.prisma.appointmentType.findFirst({ where: { id: appointmentTypeId, tenantId } });
    if (!type) throw new NotFoundException("Appointment type not found");
    const override = await this.prisma.clinicianAppointmentTypeOverride.findUnique({
      where: { clinicianId_appointmentTypeId: { clinicianId, appointmentTypeId } },
    });
    return mapEffectiveAppointmentType(type, override);
  }

  listClinicianTypeOverrides(tenantId: string, clinicianId: string) {
    return this.prisma.clinicianAppointmentTypeOverride.findMany({
      where: { tenantId, clinicianId },
      orderBy: { appointmentTypeId: "asc" },
    });
  }

  async putClinicianTypeOverrides(
    tenantId: string,
    clinicianId: string,
    items: Array<{ appointmentTypeId: string; durationMinutes?: number | null; feeAmount?: number | null }>,
  ) {
    const physician = await this.prisma.user.findFirst({
      where: { id: clinicianId, tenantId },
    });
    if (!physician) throw new NotFoundException("Clinician not found");

    return this.prisma.$transaction(async (tx) => {
      const results: unknown[] = [];
      for (const item of items) {
        const typeId = item.appointmentTypeId?.trim();
        if (!typeId) continue;
        const type = await tx.appointmentType.findFirst({ where: { id: typeId, tenantId } });
        if (!type) throw new BadRequestException(`Unknown appointment type ${typeId}`);
        const duration = item.durationMinutes ?? null;
        const fee = item.feeAmount ?? null;
        if (duration == null && fee == null) {
          await tx.clinicianAppointmentTypeOverride.deleteMany({
            where: { clinicianId, appointmentTypeId: typeId },
          });
          continue;
        }
        const row = await tx.clinicianAppointmentTypeOverride.upsert({
          where: { clinicianId_appointmentTypeId: { clinicianId, appointmentTypeId: typeId } },
          create: {
            tenantId,
            clinicianId,
            appointmentTypeId: typeId,
            durationMinutes: duration,
            feeAmount: fee != null ? new Prisma.Decimal(String(fee)) : null,
          },
          update: {
            durationMinutes: duration,
            feeAmount: fee != null ? new Prisma.Decimal(String(fee)) : null,
          },
        });
        results.push(row);
      }
      return results;
    });
  }

  async assertAppointmentTypeBookingRules(
    tenantId: string,
    clinicId: string,
    patientId: string,
    clinicianId: string,
    appointmentTypeId: string,
    startsAt: Date,
    roomLabel?: string | null,
  ): Promise<EffectiveAppointmentType> {
    const effective = await this.resolveEffectiveAppointmentType(tenantId, appointmentTypeId, clinicianId);
    const now = new Date();
    const minStart = addMinutes(now, effective.minNoticeMinutes);
    if (startsAt < minStart) {
      throw new BadRequestException(
        `Appointment must be at least ${effective.minNoticeMinutes} minutes from now for this type`,
      );
    }
    const maxStart = addMinutes(now, effective.maxDaysAhead * 24 * 60);
    if (startsAt > maxStart) {
      throw new BadRequestException(`Appointment cannot be more than ${effective.maxDaysAhead} days ahead`);
    }
    if (effective.requiresRoom && !roomLabel?.trim()) {
      throw new BadRequestException("roomLabel is required for this appointment type");
    }
    if (effective.newPatientOnly) {
      const priorEnc = await this.prisma.encounter.count({
        where: { tenantId, patientId, status: { in: ["FINALIZED", "AMENDED"] } },
      });
      const priorApt = await this.prisma.appointment.count({
        where: {
          tenantId,
          patientId,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] },
        },
      });
      if (priorEnc > 0 || priorApt > 0) {
        throw new BadRequestException("This appointment type is for new patients only");
      }
    }
    void clinicId;
    return effective;
  }

  async getAvailability(tenantId: string, clinicId: string, clinicianId: string) {
    const row = await this.prisma.clinicianAvailabilityTemplate.findFirst({
      where: { tenantId, clinicId, clinicianId },
    });
    if (!row) return null;
    const tz = await resolveClinicTimezone(this.prisma, tenantId, clinicId);
    return {
      ...row,
      weekJson: normalizeWeekJson(row.weekJson, tz),
    };
  }

  async upsertAvailability(
    tenantId: string,
    body: { clinicId: string; clinicianId: string; weekJson: unknown; blockedJson?: unknown },
  ) {
    const tz = await resolveClinicTimezone(this.prisma, tenantId, body.clinicId);
    const weekJson = parseAndValidateWeekJson(body.weekJson, tz);
    weekJson.timezone = tz;
    const blockedJson = parseBlockedJson(body.blockedJson);
    const row = await this.prisma.clinicianAvailabilityTemplate.upsert({
      where: { tenantId_clinicId_clinicianId: { tenantId, clinicId: body.clinicId, clinicianId: body.clinicianId } },
      create: {
        tenantId,
        clinicId: body.clinicId,
        clinicianId: body.clinicianId,
        weekJson: weekJson as Prisma.InputJsonValue,
        blockedJson: blockedJson as Prisma.InputJsonValue,
      },
      update: {
        weekJson: weekJson as Prisma.InputJsonValue,
        blockedJson: blockedJson as Prisma.InputJsonValue,
      },
    });
    await this.slots.invalidateAndNotify(tenantId, body.clinicId, body.clinicianId, "availability_template_updated");
    return row;
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
    let duration = 15;
    let fee = 0;
    if (body.appointmentTypeId) {
      const effective = await this.resolveEffectiveAppointmentType(
        tenantId,
        body.appointmentTypeId,
        body.clinicianId,
      );
      duration = effective.durationMinutes;
      fee = effective.feeAmount;
    }

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

  resolveDurationFromType(
    type: { durationMinutes: number } | EffectiveAppointmentType | null | undefined,
    endsAtRaw?: string | null,
    start?: Date,
  ) {
    if (endsAtRaw?.trim()) return resolveCreateAppointmentEnd(start!, endsAtRaw);
    const mins = type?.durationMinutes ?? 15;
    return addMinutes(start!, mins);
  }

  expandConflictWindow(
    start: Date,
    end: Date,
    type?: Pick<EffectiveAppointmentType, "bufferBeforeMin" | "bufferAfterMin"> | null,
  ) {
    if (!type) return { blockStart: start, blockEnd: end };
    return schedulingBlockWithBuffers(start, end, type.bufferBeforeMin, type.bufferAfterMin);
  }
}