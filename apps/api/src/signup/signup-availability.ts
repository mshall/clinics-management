import type { Prisma } from "@prisma/client";
import { emptyAvailabilityWeek, type AvailabilityWeek } from "../scheduling/availability-week-schema";

/** Weekdays 0=Sun … 6=Sat; open clinic hours on non-weekend days. */
export function availabilityWeekFromClinicHours(
  openingTime: string,
  closingTime: string,
  weekendDays: number[],
  timezone?: string,
): Prisma.InputJsonValue {
  const week: AvailabilityWeek = emptyAvailabilityWeek(timezone);
  const weekend = new Set(weekendDays);
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (weekend.has(weekday)) continue;
    week.days[weekday]?.slots.push({ start: openingTime, end: closingTime });
  }
  return week as unknown as Prisma.InputJsonValue;
}