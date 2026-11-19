import { BadRequestException, Injectable } from "@nestjs/common";
import { ListingStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { resolveClinicTimezone } from "../scheduling/clinic-scheduling-timezone";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SLOT_CAPACITY_MAX_DAYS = 30;
export const SLOT_CAPACITY_MAX_LISTINGS = 200;

export type SlotCapacityItem = {
  clinicId: string;
  clinicianId: string;
  /** Clinic-local calendar day (YYYY-MM-DD). */
  date: string;
  /** Marketplace-bookable appointment type the count is based on (the shortest one the clinician offers). */
  typeId: string;
  slotMinutes: number;
  /** Open (still bookable) marketplace slots that day. Holds, bookings, daily cap and leave are already excluded. */
  openSlots: number;
};

export type SlotCapacityResponse = {
  from: string;
  to: string;
  items: SlotCapacityItem[];
  /** Sum of openSlots per day across the returned listings, for Kiorex liquidity "slots/day". */
  totals: { date: string; openSlots: number }[];
};

/** Counting-only view of Kiorly's live slots for Kiorex liquidity metrics (KX-03 ops). No PHI, no patient data. */
@Injectable()
export class SlotCapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
  ) {}

  async capacity(q: { from?: string; to?: string; clinicId?: string; clinicianId?: string }): Promise<SlotCapacityResponse> {
    if (!q.from || !q.to || !DAY_RE.test(q.from) || !DAY_RE.test(q.to)) {
      throw new BadRequestException("from and to are required (YYYY-MM-DD, clinic-local, inclusive)");
    }
    const a = DateTime.fromISO(q.from, { zone: "utc" });
    const b = DateTime.fromISO(q.to, { zone: "utc" });
    if (!a.isValid || !b.isValid || b < a) throw new BadRequestException("Invalid date range");
    if (b.diff(a, "days").days + 1 > SLOT_CAPACITY_MAX_DAYS) {
      throw new BadRequestException(`Range cannot exceed ${SLOT_CAPACITY_MAX_DAYS} days`);
    }

    const listings = await this.prisma.marketplaceListing.findMany({
      where: {
        status: ListingStatus.LIVE,
        ...(q.clinicId ? { clinicId: q.clinicId } : {}),
        ...(q.clinicianId ? { clinicianId: q.clinicianId } : {}),
      },
      select: { tenantId: true, clinicId: true, clinicianId: true },
      orderBy: [{ clinicId: "asc" }, { clinicianId: "asc" }],
      take: SLOT_CAPACITY_MAX_LISTINGS,
    });

    const items: SlotCapacityItem[] = [];
    const totals = new Map<string, number>();
    const dates: string[] = [];
    for (let d = a; d <= b; d = d.plus({ days: 1 })) dates.push(d.toISODate()!);

    for (const l of listings) {
      const types = await this.prisma.appointmentType.findMany({
        where: {
          tenantId: l.tenantId,
          isActive: true,
          marketplaceBookable: true,
          OR: [{ clinicId: l.clinicId }, { clinicId: null }],
        },
        select: { id: true, durationMinutes: true },
        orderBy: [{ durationMinutes: "asc" }, { id: "asc" }],
        take: 1,
      });
      const type = types[0];
      if (!type) continue;
      const tz = await resolveClinicTimezone(this.prisma, l.tenantId, l.clinicId);
      const from = DateTime.fromISO(q.from, { zone: tz }).startOf("day").toUTC().toJSDate();
      const to = DateTime.fromISO(q.to, { zone: tz }).plus({ days: 1 }).startOf("day").toUTC().toJSDate();
      const result = await this.slots.getSlots({
        tenantId: l.tenantId,
        clinicId: l.clinicId,
        clinicianId: l.clinicianId,
        typeId: type.id,
        from,
        to,
        channel: SLOT_CHANNEL.MARKETPLACE,
      });
      const perDay = new Map<string, number>();
      for (const s of result.slots) {
        const day = DateTime.fromISO(s.startsAt, { zone: "utc" }).setZone(tz).toISODate()!;
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
      for (const date of dates) {
        const openSlots = perDay.get(date) ?? 0;
        items.push({
          clinicId: l.clinicId,
          clinicianId: l.clinicianId,
          date,
          typeId: type.id,
          slotMinutes: type.durationMinutes,
          openSlots,
        });
        totals.set(date, (totals.get(date) ?? 0) + openSlots);
      }
    }

    return {
      from: q.from,
      to: q.to,
      items,
      totals: dates.map((date) => ({ date, openSlots: totals.get(date) ?? 0 })),
    };
  }
}
