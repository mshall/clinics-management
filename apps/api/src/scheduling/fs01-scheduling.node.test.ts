import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapEffectiveAppointmentType, schedulingBlockWithBuffers } from "./appointment-type-rules";
import { emptyAvailabilityWeek, normalizeWeekJson, parseAndValidateWeekJson } from "./availability-week-schema";

describe("FS-01 scheduling engine", () => {
  it("migrates legacy weekJson array without dropping slots", () => {
    const legacy = [
      { weekday: 1, start: "09:00", end: "12:00", roomLabel: "Room 1" },
      { weekday: 3, startTime: "14:00", endTime: "17:00" },
    ];
    const normalized = normalizeWeekJson(legacy, "Africa/Cairo");
    const parsed = parseAndValidateWeekJson(normalized, "Africa/Cairo");
    assert.equal(parsed.days[1].slots[0]?.start, "09:00");
    assert.equal(parsed.days[3].slots[0]?.end, "17:00");
  });

  it("empty week schema preserves open scheduling (no slots)", () => {
    const week = emptyAvailabilityWeek("Africa/Cairo");
    const parsed = parseAndValidateWeekJson(week);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.days.length, 7);
    assert.equal(parsed.days.every((d) => d.slots.length === 0), true);
  });

  it("clinician override keeps type buffers and rules from base type", () => {
    const base = {
      id: "t1",
      tenantId: "tenant",
      clinicId: null,
      nameEn: "Consult",
      nameAr: "",
      durationMinutes: 15,
      feeAmount: { toNumber: () => 200 } as never,
      colorHex: "#3b82f6",
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      requiresRoom: false,
      marketplaceBookable: false,
      minNoticeMinutes: 120,
      maxDaysAhead: 30,
      depositAmount: null,
      newPatientOnly: false,
      serviceLocation: "IN_CLINIC" as const,
      homeSurchargeAmount: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const effective = mapEffectiveAppointmentType(base, {
      tenantId: "tenant",
      clinicianId: "doc",
      appointmentTypeId: "t1",
      durationMinutes: 30,
      feeAmount: { toNumber: () => 250 } as never,
      updatedAt: new Date(),
    });
    assert.equal(effective.durationMinutes, 30);
    assert.equal(effective.feeAmount, 250);
    assert.equal(effective.minNoticeMinutes, 120);
    assert.equal(effective.bufferBeforeMin, 0);
  });

  it("buffers expand conflict block without changing visible slot length", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:15:00Z");
    const { blockStart, blockEnd } = schedulingBlockWithBuffers(start, end, 5, 10);
    assert.equal(blockStart.toISOString(), "2026-01-01T09:55:00.000Z");
    assert.equal(blockEnd.toISOString(), "2026-01-01T10:25:00.000Z");
  });
});