import { defaultMonthRange } from "@/stores/date-range-store";

const RANGE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Valid YYYY-MM-DD range for report queries; falls back to the current calendar month. */
export function sanitizeReportingRange(from: string, to: string): { from: string; to: string } {
  const f = from.trim();
  const t = to.trim();
  if (RANGE_DAY.test(f) && RANGE_DAY.test(t) && f <= t) {
    return { from: f, to: t };
  }
  return defaultMonthRange();
}
