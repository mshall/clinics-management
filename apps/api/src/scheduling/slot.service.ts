import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  BookingSource,
  LeaveStatus,
} from "@prisma/client";
import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { mapEffectiveAppointmentType } from "./appointment-type-rules";
import { normalizeWeekJson, parseBlockedJson, type AvailabilityWeek } from "./availability-week-schema";
import { resolveClinicTimezone } from "./clinic-scheduling-timezone";
import { generateSlots, type GeneratedSlot, type SlotEngineAppointment } from "./slot-engine";
import { SLOT_CHANNEL, SLOTS_CHANGED_TOPIC, type SlotChannel } from "./slot-channel";
import { ClinicianDaySlotCache } from "./slot-cache";
import { addMinutes, effectiveAppointmentEnd } from "../common/appointment-scheduling";

export type GetSlotsParams = {
  tenantId: string;
  clinicId: string;
  clinicianId: string;
  typeId: string;
  from: Date;
  to: Date;
  channel: SlotChannel;
};

export const MARKETPLACE_DAILY_CAP_CODE = "MARKETPLACE_DAILY_CAP_REACHED";

export type SlotDto = {
  startsAt: string;
  endsAt: string;
  roomLabel: string | null;
};

@Injectable()
export class SlotService {
  private readonly cache = new ClinicianDaySlotCache();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxEventService,
  ) {}

  async getSlots(params: GetSlotsParams): Promise<{
    clinicId: string;
    clinicianId: string;
    typeId: string;
    from: string;
    to: string;
    channel: SlotChannel;
    slots: SlotDto[];
  }> {
    const { tenantId, clinicId, clinicianId, typeId, from, to, channel } = params;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException("Invalid from/to range");
    }
    const maxSpan = 31 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxSpan) {
      throw new BadRequestException("Slot range cannot exceed 31 days");
    }

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const typeRow = await this.prisma.appointmentType.findFirst({
      where: { id: typeId, tenantId, clinicId, isActive: true },
    });
    if (!typeRow) throw new NotFoundException("Appointment type not found");
    if (channel === SLOT_CHANNEL.MARKETPLACE && !typeRow.marketplaceBookable) {
      throw new BadRequestException("Appointment type is not marketplace bookable");
    }

    const override = await this.prisma.clinicianAppointmentTypeOverride.findFirst({
      where: { tenantId, clinicianId, appointmentTypeId: typeId },
    });
    const effectiveType = mapEffectiveAppointmentType(typeRow, override);

    const tz = await resolveClinicTimezone(this.prisma, tenantId, clinicId);
    const template = await this.prisma.clinicianAvailabilityTemplate.findFirst({
      where: { tenantId, clinicId, clinicianId },
    });
    const week = normalizeWeekJson(template?.weekJson, tz) as AvailabilityWeek;
    const blockedJson = parseBlockedJson(template?.blockedJson);
    const marketplaceDailyCap = template?.marketplaceDailyCap ?? 20;

    const blockedPeriods = blockedJson
      .map((b) => ({ start: new Date(b.from), end: new Date(b.to) }))
      .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()) && b.end > b.start);

    const appointments = [
      ...(await this.loadAppointments(tenantId, clinicId, clinicianId, from, to)),
      ...(await this.loadActiveHolds(tenantId, clinicId, clinicianId, from, to)),
    ];
    const roomAppointments = await this.loadRoomAppointments(tenantId, clinicId, from, to);
    const leaveDays = await this.loadLeaveLocalDays(tenantId, clinicianId, from, to, tz);
    const marketplaceCountsByDay =
      channel === SLOT_CHANNEL.MARKETPLACE
        ? await this.marketplaceCountsByLocalDay(tenantId, clinicId, clinicianId, from, to, tz)
        : [];

    const localDates = this.localDatesBetween(from, to, tz);
    const slots: GeneratedSlot[] = [];

    for (const localDate of localDates) {
      const cacheKey = ClinicianDaySlotCache.key({
        tenantId,
        clinicId,
        clinicianId,
        localDate,
        typeId,
        channel,
      });
      const cached = this.cache.get(cacheKey);
      if (cached) {
        for (const s of cached.slots) {
          const start = new Date(s.startsAt);
          if (start >= from && start < to) {
            slots.push({
              startsAt: start,
              endsAt: new Date(s.endsAt),
              roomLabel: s.roomLabel ?? null,
            });
          }
        }
        continue;
      }

      const dayFrom = DateTime.fromISO(localDate, { zone: tz }).startOf("day").toUTC().toJSDate();
      const dayTo = DateTime.fromISO(localDate, { zone: tz }).plus({ days: 1 }).startOf("day").toUTC().toJSDate();

      const daySlots = generateSlots({
        clinicTimezone: tz,
        week,
        blockedPeriods,
        leaveDays,
        appointments: appointments.filter((a) => a.startsAt >= dayFrom && a.startsAt < dayTo),
        roomAppointments,
        effectiveType,
        channel,
        from: dayFrom,
        to: dayTo,
        marketplaceDailyCap,
        marketplaceCountsByDay,
      });

      this.cache.set(
        cacheKey,
        daySlots.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          roomLabel: s.roomLabel,
        })),
      );

      for (const s of daySlots) {
        if (s.startsAt >= from && s.startsAt < to) slots.push(s);
      }
    }

    slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return {
      clinicId,
      clinicianId,
      typeId,
      from: from.toISOString(),
      to: to.toISOString(),
      channel,
      slots: slots.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        roomLabel: s.roomLabel,
      })),
    };
  }

  async invalidateAndNotify(tenantId: string, clinicId: string, clinicianId: string, reason: string): Promise<void> {
    const prefix = `${tenantId}:${clinicId}:${clinicianId}:`;
    this.cache.invalidatePrefix(prefix);
    await this.outbox.enqueue(tenantId, SLOTS_CHANGED_TOPIC, {
      clinicId,
      clinicianId,
      reason,
      at: new Date().toISOString(),
    });
  }

  private localDatesBetween(from: Date, to: Date, zone: string): string[] {
    const start = DateTime.fromJSDate(from, { zone }).startOf("day");
    const end = DateTime.fromJSDate(to, { zone }).startOf("day");
    const dates: string[] = [];
    let cursor = start;
    while (cursor <= end) {
      dates.push(cursor.toISODate()!);
      cursor = cursor.plus({ days: 1 });
    }
    return dates;
  }

  private async loadActiveHolds(
    tenantId: string,
    clinicId: string,
    clinicianId: string,
    from: Date,
    to: Date,
  ): Promise<SlotEngineAppointment[]> {
    const rows = await this.prisma.slotHold.findMany({
      where: {
        tenantId,
        clinicId,
        clinicianId,
        expiresAt: { gt: new Date() },
        startsAt: { gte: addMinutes(from, -24 * 60), lte: addMinutes(to, 24 * 60) },
      },
      select: { startsAt: true, endsAt: true },
    });
    return rows.map((r) => ({
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    }));
  }

  private async loadAppointments(
    tenantId: string,
    clinicId: string,
    clinicianId: string,
    from: Date,
    to: Date,
  ): Promise<SlotEngineAppointment[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        clinicianId,
        startsAt: { gte: addMinutes(from, -24 * 60), lte: addMinutes(to, 24 * 60) },
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
      select: {
        startsAt: true,
        endsAt: true,
        roomLabel: true,
        appointmentTypeId: true,
        appointmentType: {
          select: { bufferBeforeMin: true, bufferAfterMin: true },
        },
      },
    });
    return rows.map((r) => ({
      startsAt: r.startsAt,
      endsAt: effectiveAppointmentEnd(r.startsAt, r.endsAt),
      roomLabel: r.roomLabel,
      bufferBeforeMin: r.appointmentType?.bufferBeforeMin ?? 0,
      bufferAfterMin: r.appointmentType?.bufferAfterMin ?? 0,
    }));
  }

  private async loadRoomAppointments(
    tenantId: string,
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<SlotEngineAppointment[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        startsAt: { gte: addMinutes(from, -24 * 60), lte: addMinutes(to, 24 * 60) },
        status: { notIn: [AppointmentStatus.CANCELLED] },
        roomLabel: { not: null },
      },
      select: {
        startsAt: true,
        endsAt: true,
        roomLabel: true,
        appointmentType: {
          select: { bufferBeforeMin: true, bufferAfterMin: true },
        },
      },
    });
    return rows.map((r) => ({
      startsAt: r.startsAt,
      endsAt: effectiveAppointmentEnd(r.startsAt, r.endsAt),
      roomLabel: r.roomLabel,
      bufferBeforeMin: r.appointmentType?.bufferBeforeMin ?? 0,
      bufferAfterMin: r.appointmentType?.bufferAfterMin ?? 0,
    }));
  }

  private async loadLeaveLocalDays(
    tenantId: string,
    clinicianId: string,
    from: Date,
    to: Date,
    zone: string,
  ): Promise<Array<{ localDate: string }>> {
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
    const days: Array<{ localDate: string }> = [];
    for (const leave of leaves) {
      let cursor = DateTime.fromJSDate(leave.startDate, { zone }).startOf("day");
      const end = DateTime.fromJSDate(leave.endDate, { zone }).startOf("day");
      while (cursor <= end) {
        const iso = cursor.toISODate()!;
        if (!days.some((d) => d.localDate === iso)) days.push({ localDate: iso });
        cursor = cursor.plus({ days: 1 });
      }
    }
    return days;
  }

  private async marketplaceCountsByLocalDay(
    tenantId: string,
    clinicId: string,
    clinicianId: string,
    from: Date,
    to: Date,
    zone: string,
  ): Promise<Array<{ localDate: string; count: number }>> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicId,
        clinicianId,
        // Whole clinic-local days: a narrow window (a hold or booking asks for one slot) must still see the day's earlier bookings.
        startsAt: {
          gte: DateTime.fromJSDate(from, { zone }).startOf("day").toUTC().toJSDate(),
          lt: DateTime.fromJSDate(new Date(to.getTime() - 1), { zone }).plus({ days: 1 }).startOf("day").toUTC().toJSDate(),
        },
        status: { notIn: [AppointmentStatus.CANCELLED] },
        bookingSource: { in: [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP] },
      },
      select: { startsAt: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = DateTime.fromJSDate(r.startsAt, { zone }).toISODate()!;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([localDate, count]) => ({ localDate, count }));
  }

  /**
   * Marketplace daily cap on the WRITE paths (holds, bookings, reschedules), not only on the slot list: the slot list is cached and a booking
   * that carries no hold never consulted it. Counts the clinician's non-cancelled Kiorex bookings plus other active holds on the slot's clinic-local day.
   * Call inside the caller's transaction, after taking the clinician-day advisory lock (see `lockMarketplaceDay`). Rejects with 409 MARKETPLACE_DAILY_CAP_REACHED.
   */
  async assertMarketplaceDailyCapRoom(
    tx: Prisma.TransactionClient,
    p: { tenantId: string; clinicId: string; clinicianId: string; startsAt: Date; excludeHoldId?: string; excludeAppointmentId?: string },
  ): Promise<void> {
    const tz = await resolveClinicTimezone(tx as unknown as PrismaService, p.tenantId, p.clinicId);
    const template = await tx.clinicianAvailabilityTemplate.findFirst({
      where: { tenantId: p.tenantId, clinicId: p.clinicId, clinicianId: p.clinicianId },
      select: { marketplaceDailyCap: true },
    });
    const cap = template?.marketplaceDailyCap ?? 20;
    const dayStart = DateTime.fromJSDate(p.startsAt, { zone: tz }).startOf("day").toUTC().toJSDate();
    const dayEnd = DateTime.fromJSDate(p.startsAt, { zone: tz }).plus({ days: 1 }).startOf("day").toUTC().toJSDate();
    const [booked, held] = await Promise.all([
      tx.appointment.count({
        where: {
          tenantId: p.tenantId,
          clinicId: p.clinicId,
          clinicianId: p.clinicianId,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { notIn: [AppointmentStatus.CANCELLED] },
          bookingSource: { in: [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP] },
          ...(p.excludeAppointmentId ? { NOT: { id: p.excludeAppointmentId } } : {}),
        },
      }),
      tx.slotHold.count({
        where: {
          tenantId: p.tenantId,
          clinicId: p.clinicId,
          clinicianId: p.clinicianId,
          startsAt: { gte: dayStart, lt: dayEnd },
          expiresAt: { gt: new Date() },
          ...(p.excludeHoldId ? { NOT: { id: p.excludeHoldId } } : {}),
        },
      }),
    ]);
    if (booked + held >= cap) {
      throw new ConflictException({ code: MARKETPLACE_DAILY_CAP_CODE, message: "The doctor's daily Kiorex booking limit is reached" });
    }
  }

  /** Serialises hold/booking writes per clinician and clinic-local day so two parallel writers cannot both pass the cap check. */
  async lockMarketplaceDay(tx: Prisma.TransactionClient, tenantId: string, clinicId: string, clinicianId: string, startsAt: Date): Promise<void> {
    const tz = await resolveClinicTimezone(tx as unknown as PrismaService, tenantId, clinicId);
    const day = DateTime.fromJSDate(startsAt, { zone: tz }).toISODate();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mkt-cap:${clinicianId}:${day}`}))`;
  }
}
