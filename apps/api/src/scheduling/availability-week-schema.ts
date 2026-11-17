import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const timeHm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);

const slotSchema = z.object({
  start: timeHm,
  end: timeHm,
  roomLabel: z.string().max(64).optional(),
});

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  slots: z.array(slotSchema).max(24),
});

export const availabilityWeekSchema = z.object({
  version: z.literal(1),
  timezone: z.string().min(1).max(64).optional(),
  days: z.array(daySchema).length(7),
});

export const availabilityBlockedSchema = z.array(
  z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
);

export type AvailabilityWeek = z.infer<typeof availabilityWeekSchema>;

export function emptyAvailabilityWeek(timezone?: string): AvailabilityWeek {
  return {
    version: 1,
    timezone: timezone?.trim() || "UTC",
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, slots: [] })),
  };
}

/** Coerce legacy weekJson (array or partial) into versioned schema without changing open hours semantics. */
export function normalizeWeekJson(raw: unknown, clinicTimezone?: string): AvailabilityWeek {
  const empty = emptyAvailabilityWeek(clinicTimezone);
  if (raw == null) return empty;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const weekday = Number(o.weekday ?? o.day ?? o.dayOfWeek);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      const start = typeof o.start === "string" ? o.start : typeof o.startTime === "string" ? o.startTime : null;
      const end = typeof o.end === "string" ? o.end : typeof o.endTime === "string" ? o.endTime : null;
      if (!start || !end) continue;
      empty.days[weekday]?.slots.push({
        start,
        end,
        ...(typeof o.roomLabel === "string" ? { roomLabel: o.roomLabel } : {}),
      });
    }
    return empty;
  }
  if (typeof raw === "object") {
    const parsed = availabilityWeekSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.days)) {
      const merged = emptyAvailabilityWeek(typeof o.timezone === "string" ? o.timezone : clinicTimezone);
      for (const d of o.days) {
        if (!d || typeof d !== "object") continue;
        const day = d as Record<string, unknown>;
        const weekday = Number(day.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
        const slots = Array.isArray(day.slots) ? day.slots : [];
        for (const s of slots) {
          if (!s || typeof s !== "object") continue;
          const slot = s as Record<string, unknown>;
          if (typeof slot.start !== "string" || typeof slot.end !== "string") continue;
          merged.days[weekday].slots.push({
            start: slot.start,
            end: slot.end,
            ...(typeof slot.roomLabel === "string" ? { roomLabel: slot.roomLabel } : {}),
          });
        }
      }
      return merged;
    }
  }
  return empty;
}

export function parseAndValidateWeekJson(raw: unknown, clinicTimezone?: string): AvailabilityWeek {
  const normalized = normalizeWeekJson(raw, clinicTimezone);
  const parsed = availabilityWeekSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new BadRequestException(`Invalid weekJson: ${parsed.error.message}`);
  }
  for (const day of parsed.data.days) {
    for (const slot of day.slots) {
      if (slot.start >= slot.end) {
        throw new BadRequestException(`Slot end must be after start on weekday ${day.weekday}`);
      }
    }
  }
  return parsed.data;
}

export function parseBlockedJson(raw: unknown): z.infer<typeof availabilityBlockedSchema> {
  if (raw == null) return [];
  const parsed = availabilityBlockedSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException(`Invalid blockedJson: ${parsed.error.message}`);
  return parsed.data;
}