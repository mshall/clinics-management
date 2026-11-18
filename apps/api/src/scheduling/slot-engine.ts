import { DateTime } from "luxon";
import { APPOINTMENT_SLOT_MINUTES, addMinutes, appointmentIntervalsOverlap } from "../common/appointment-scheduling";
import type { AvailabilityWeek } from "./availability-week-schema";
import { schedulingBlockWithBuffers, type EffectiveAppointmentType } from "./appointment-type-rules";
import { SLOT_CHANNEL, type SlotChannel } from "./slot-channel";

export type SlotEngineBlockedPeriod = { start: Date; end: Date };
export type SlotEngineAppointment = {
  startsAt: Date;
  endsAt: Date;
  roomLabel?: string | null;
  bufferBeforeMin: number;
  bufferAfterMin: number;
};
export type SlotEngineLeaveDay = { localDate: string };
export type SlotEngineMarketplaceDayCount = { localDate: string; count: number };

export type SlotEngineInput = {
  clinicTimezone: string;
  week: AvailabilityWeek;
  blockedPeriods: SlotEngineBlockedPeriod[];
  leaveDays: SlotEngineLeaveDay[];
  appointments: SlotEngineAppointment[];
  roomAppointments: SlotEngineAppointment[];
  effectiveType: EffectiveAppointmentType;
  channel: SlotChannel;
  from: Date;
  to: Date;
  now?: Date;
  marketplaceDailyCap: number;
  marketplaceCountsByDay: SlotEngineMarketplaceDayCount[];
};

export type GeneratedSlot = {
  startsAt: Date;
  endsAt: Date;
  roomLabel: string | null;
};

function hmToUtcOnLocalDay(
  clinicTimezone: string,
  localDate: string,
  hm: string,
): Date {
  const [h, m] = hm.split(":").map(Number);
  return DateTime.fromISO(localDate, { zone: clinicTimezone })
    .set({ hour: h, minute: m, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
}

function localDatesBetween(from: Date, to: Date, zone: string): string[] {
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

function weekdayForLocalDate(localDate: string, zone: string): number {
  return DateTime.fromISO(localDate, { zone }).weekday % 7;
}

function overlapsAny(
  slotStart: Date,
  slotEnd: Date,
  intervals: Array<{ start: Date; end: Date }>,
): boolean {
  return intervals.some((b) => appointmentIntervalsOverlap(slotStart, slotEnd, b.start, b.end));
}

function appointmentBlock(a: SlotEngineAppointment): { start: Date; end: Date } {
  const { blockStart, blockEnd } = schedulingBlockWithBuffers(
    a.startsAt,
    a.endsAt,
    a.bufferBeforeMin,
    a.bufferAfterMin,
  );
  return { start: blockStart, end: blockEnd };
}

function candidateBlock(
  slotStart: Date,
  durationMinutes: number,
  effectiveType: EffectiveAppointmentType,
): { start: Date; end: Date } {
  const slotEnd = addMinutes(slotStart, durationMinutes);
  const { blockStart, blockEnd } = schedulingBlockWithBuffers(
    slotStart,
    slotEnd,
    effectiveType.bufferBeforeMin,
    effectiveType.bufferAfterMin,
  );
  return { start: blockStart, end: blockEnd };
}

function roomIsFree(
  roomLabel: string | undefined,
  slotStart: Date,
  durationMinutes: number,
  effectiveType: EffectiveAppointmentType,
  roomAppointments: SlotEngineAppointment[],
): boolean {
  if (!roomLabel?.trim()) return true;
  const slotEnd = addMinutes(slotStart, durationMinutes);
  const { blockStart, blockEnd } = schedulingBlockWithBuffers(
    slotStart,
    slotEnd,
    effectiveType.bufferBeforeMin,
    effectiveType.bufferAfterMin,
  );
  const label = roomLabel.trim();
  for (const a of roomAppointments) {
    if ((a.roomLabel ?? "").trim() !== label) continue;
    const b = appointmentBlock(a);
    if (appointmentIntervalsOverlap(blockStart, blockEnd, b.start, b.end)) return false;
  }
  return true;
}

type SlotChannelRulesInput = Pick<
  SlotEngineInput,
  "channel" | "effectiveType" | "now" | "marketplaceDailyCap" | "marketplaceCountsByDay"
>;

function passesChannelRules(
  input: SlotChannelRulesInput,
  slotStart: Date,
  localDate: string,
  newSlotCountOnDay: number,
): boolean {
  const now = input.now ?? new Date();
  const type = input.effectiveType;
  if (input.channel === SLOT_CHANNEL.MARKETPLACE) {
    if (!type.marketplaceBookable) return false;
    const minStart = addMinutes(now, type.minNoticeMinutes);
    if (slotStart < minStart) return false;
    const maxStart = addMinutes(now, type.maxDaysAhead * 24 * 60);
    if (slotStart > maxStart) return false;
    const existing =
      input.marketplaceCountsByDay.find((d) => d.localDate === localDate)?.count ?? 0;
    if (existing + newSlotCountOnDay > input.marketplaceDailyCap) return false;
  }
  return true;
}

export function generateSlotsForDay(input: Omit<SlotEngineInput, "from" | "to"> & { localDate: string }): GeneratedSlot[] {
  const zone = input.clinicTimezone;
  const weekday = weekdayForLocalDate(input.localDate, zone);
  const day = input.week.days.find((d) => d.weekday === weekday);
  if (!day || day.slots.length === 0) return [];

  if (input.leaveDays.some((l) => l.localDate === input.localDate)) return [];

  const clinicianBlocks = input.appointments.map(appointmentBlock);
  const templateBlocks = input.blockedPeriods.map((b) => ({ start: b.start, end: b.end }));

  const duration = input.effectiveType.durationMinutes;
  const step = APPOINTMENT_SLOT_MINUTES;
  const slots: GeneratedSlot[] = [];
  let marketplaceOffersOnDay = 0;

  for (const window of day.slots) {
    let cursor = hmToUtcOnLocalDay(zone, input.localDate, window.start);
    const windowEnd = hmToUtcOnLocalDay(zone, input.localDate, window.end);
    const roomLabels = window.roomLabel?.trim()
      ? [window.roomLabel.trim()]
      : input.effectiveType.requiresRoom
        ? []
        : [null as string | null];

    while (cursor < windowEnd) {
      const slotEnd = addMinutes(cursor, duration);
      if (slotEnd > windowEnd) break;

      const block = candidateBlock(cursor, duration, input.effectiveType);
      if (!overlapsAny(block.start, block.end, clinicianBlocks)) {
        if (!overlapsAny(block.start, block.end, templateBlocks)) {
          if (
            passesChannelRules(input, cursor, input.localDate, marketplaceOffersOnDay + 1)
          ) {
            for (const roomLabel of roomLabels.length ? roomLabels : [null]) {
              if (
                !input.effectiveType.requiresRoom ||
                (typeof roomLabel === "string" &&
                  roomIsFree(roomLabel, cursor, duration, input.effectiveType, input.roomAppointments))
              ) {
                slots.push({
                  startsAt: new Date(cursor.getTime()),
                  endsAt: slotEnd,
                  roomLabel: roomLabel ?? null,
                });
                if (input.channel === SLOT_CHANNEL.MARKETPLACE) marketplaceOffersOnDay += 1;
                break;
              }
            }
          }
        }
      }
      cursor = addMinutes(cursor, step);
    }
  }

  return slots;
}

export function generateSlots(input: SlotEngineInput): GeneratedSlot[] {
  const zone = input.clinicTimezone;
  const dates = localDatesBetween(input.from, input.to, zone);
  const all: GeneratedSlot[] = [];
  for (const localDate of dates) {
    const daySlots = generateSlotsForDay({ ...input, localDate });
    for (const s of daySlots) {
      if (s.startsAt >= input.from && s.startsAt < input.to) all.push(s);
    }
  }
  all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return all;
}

/** Property helper: slot block must not overlap forbidden intervals. */
export function slotViolatesIntervals(
  slot: GeneratedSlot,
  effectiveType: EffectiveAppointmentType,
  forbidden: Array<{ start: Date; end: Date }>,
): boolean {
  const block = candidateBlock(slot.startsAt, effectiveType.durationMinutes, effectiveType);
  return overlapsAny(block.start, block.end, forbidden);
}