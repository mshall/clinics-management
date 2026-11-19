import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { emptyAvailabilityWeek } from "./availability-week-schema";
import { generateSlots } from "./slot-engine";
import { mapEffectiveAppointmentType } from "./appointment-type-rules";
import { Prisma, type AppointmentType } from "@prisma/client";
import { SLOT_CHANNEL } from "./slot-channel";

describe("KX-03 slot performance", () => {
  it("p95 under 150ms for 14-day window", () => {
    const zone = "Africa/Cairo";
    const week = emptyAvailabilityWeek(zone);
    for (let wd = 0; wd < 7; wd++) {
      week.days[wd]!.slots.push({ start: "08:00", end: "20:00" });
    }
    const type = {
      id: "t1",
      tenantId: "t",
      clinicId: "c",
      nameEn: "Visit",
      nameAr: "كشف",
      durationMinutes: 20,
      bufferBeforeMin: 5,
      bufferAfterMin: 5,
      requiresRoom: false,
      marketplaceBookable: true,
      minNoticeMinutes: 0,
      maxDaysAhead: 30,
      depositAmount: null,
      newPatientOnly: false,
      colorHex: "#000",
      isActive: true,
      feeAmount: new Prisma.Decimal(100),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AppointmentType;
    const eff = mapEffectiveAppointmentType(type);
    const from = DateTime.fromISO("2026-06-01", { zone }).toUTC().toJSDate();
    const to = DateTime.fromISO("2026-06-15", { zone }).toUTC().toJSDate();

    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      generateSlots({
        clinicTimezone: zone,
        week,
        blockedPeriods: [],
        leaveDays: [],
        appointments: [],
        roomAppointments: [],
        effectiveType: eff,
        channel: SLOT_CHANNEL.MARKETPLACE,
        from,
        to,
        now: DateTime.fromISO("2026-05-01", { zone }).toUTC().toJSDate(),
        marketplaceDailyCap: 50,
        marketplaceCountsByDay: [],
      });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    assert.ok(p95 < 150, `p95 ${p95}ms exceeds 150ms`);
  });

  it("50 concurrent slot generations keep p95 under 150ms (QA-07 rps proxy)", async () => {
    const zone = "Africa/Cairo";
    const week = emptyAvailabilityWeek(zone);
    for (let wd = 0; wd < 7; wd++) {
      week.days[wd]!.slots.push({ start: "09:00", end: "17:00" });
    }
    const type = {
      id: "t1",
      tenantId: "t",
      clinicId: "c",
      nameEn: "Visit",
      nameAr: "كشف",
      durationMinutes: 15,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      requiresRoom: false,
      marketplaceBookable: true,
      minNoticeMinutes: 0,
      maxDaysAhead: 14,
      depositAmount: null,
      newPatientOnly: false,
      colorHex: "#000",
      isActive: true,
      feeAmount: new Prisma.Decimal(100),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AppointmentType;
    const eff = mapEffectiveAppointmentType(type);
    const from = DateTime.fromISO("2026-07-01", { zone }).toUTC().toJSDate();
    const to = DateTime.fromISO("2026-07-08", { zone }).toUTC().toJSDate();
    const now = DateTime.fromISO("2026-06-01", { zone }).toUTC().toJSDate();

    const samples = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const t0 = performance.now();
        generateSlots({
          clinicTimezone: zone,
          week,
          blockedPeriods: [],
          leaveDays: [],
          appointments: [],
          roomAppointments: [],
          effectiveType: eff,
          channel: SLOT_CHANNEL.MARKETPLACE,
          from,
          to,
          now,
          marketplaceDailyCap: 40,
          marketplaceCountsByDay: [],
        });
        return performance.now() - t0;
      }),
    );
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    assert.ok(p95 < 150, `concurrent p95 ${p95}ms exceeds 150ms at 50 parallel`);
  });
});