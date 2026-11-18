import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { emptyAvailabilityWeek } from "./availability-week-schema";
import {
  generateSlots,
  slotViolatesIntervals,
  type SlotEngineAppointment,
} from "./slot-engine";
import { mapEffectiveAppointmentType } from "./appointment-type-rules";
import { Prisma, type AppointmentType } from "@prisma/client";
import { schedulingBlockWithBuffers } from "./appointment-type-rules";
import { SLOT_CHANNEL } from "./slot-channel";

const baseType = {
  id: "t1",
  tenantId: "ten",
  clinicId: "cl",
  nameEn: "Visit",
  nameAr: "كشف",
  durationMinutes: 30,
  feeAmount: new Prisma.Decimal(100),
  colorHex: "#000",
  isActive: true,
  bufferBeforeMin: 10,
  bufferAfterMin: 5,
  requiresRoom: false,
  marketplaceBookable: true,
  minNoticeMinutes: 0,
  maxDaysAhead: 60,
  depositAmount: null,
  newPatientOnly: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as AppointmentType;

function effective(over: Partial<AppointmentType> = {}) {
  return mapEffectiveAppointmentType({ ...baseType, ...over });
}

function appt(start: string, end: string, buffers = { before: 10, after: 5 }): SlotEngineAppointment {
  return {
    startsAt: new Date(start),
    endsAt: new Date(end),
    bufferBeforeMin: buffers.before,
    bufferAfterMin: buffers.after,
  };
}

function forbiddenFrom(input: {
  appointments: SlotEngineAppointment[];
  blocked: Array<{ start: Date; end: Date }>;
  effectiveType: ReturnType<typeof effective>;
}) {
  const blocks = input.appointments.map((a) => {
    const { blockStart, blockEnd } = schedulingBlockWithBuffers(
      a.startsAt,
      a.endsAt,
      a.bufferBeforeMin,
      a.bufferAfterMin,
    );
    return { start: blockStart, end: blockEnd };
  });
  return [...blocks, ...input.blocked];
}

describe("KX-03 slot engine", () => {
  it("no generated slot overlaps appointments, leave, or blocked periods", () => {
    const zone = "Africa/Cairo";
    const week = emptyAvailabilityWeek(zone);
    for (const wd of [1, 2, 3, 4, 5]) {
      week.days[wd]!.slots.push({ start: "09:00", end: "17:00" });
    }

    const from = DateTime.fromISO("2026-03-02", { zone }).toUTC().toJSDate();
    const to = DateTime.fromISO("2026-03-16", { zone }).toUTC().toJSDate();

    const appointments: SlotEngineAppointment[] = [
      appt("2026-03-03T07:30:00.000Z", "2026-03-03T08:00:00.000Z"),
      appt("2026-03-10T10:00:00.000Z", "2026-03-10T10:45:00.000Z"),
    ];

    const blocked = [
      {
        start: DateTime.fromISO("2026-03-05T08:00:00", { zone }).toUTC().toJSDate(),
        end: DateTime.fromISO("2026-03-05T12:00:00", { zone }).toUTC().toJSDate(),
      },
    ];

    const leaveDays = [{ localDate: "2026-03-08" }];

    const eff = effective();
    const slots = generateSlots({
      clinicTimezone: zone,
      week,
      blockedPeriods: blocked,
      leaveDays,
      appointments,
      roomAppointments: [],
      effectiveType: eff,
      channel: SLOT_CHANNEL.INTERNAL,
      from,
      to,
      now: DateTime.fromISO("2026-03-01T00:00:00", { zone }).toUTC().toJSDate(),
      marketplaceDailyCap: 20,
      marketplaceCountsByDay: [],
    });

    const forbidden = forbiddenFrom({ appointments, blocked, effectiveType: eff });
    for (const slot of slots) {
      assert.equal(slotViolatesIntervals(slot, eff, forbidden), false);
      assert.equal(
        leaveDays.some((l) => DateTime.fromJSDate(slot.startsAt, { zone }).toISODate() === l.localDate),
        false,
      );
    }
  });

  it("respects DST spring-forward edge in America/New_York", () => {
    const zone = "America/New_York";
    const week = emptyAvailabilityWeek(zone);
    week.days[0]!.slots.push({ start: "02:30", end: "04:30" });
    const from = DateTime.fromISO("2026-03-08", { zone }).startOf("day").toUTC().toJSDate();
    const to = DateTime.fromISO("2026-03-09", { zone }).startOf("day").toUTC().toJSDate();
    const eff = effective({ durationMinutes: 15 });
    const slots = generateSlots({
      clinicTimezone: zone,
      week,
      blockedPeriods: [],
      leaveDays: [],
      appointments: [],
      roomAppointments: [],
      effectiveType: eff,
      channel: SLOT_CHANNEL.INTERNAL,
      from,
      to,
      now: DateTime.fromISO("2026-03-01", { zone }).toUTC().toJSDate(),
      marketplaceDailyCap: 20,
      marketplaceCountsByDay: [],
    });
    for (const s of slots) {
      const local = DateTime.fromJSDate(s.startsAt, { zone });
      assert.ok(local.hour >= 2 || local.hour < 5);
    }
  });
});