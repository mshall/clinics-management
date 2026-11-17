import { resolveReportingRange } from "./reporting-range";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Max reporting window for org insights (avoids unbounded scans on large tenants). */
export const MAX_INSIGHTS_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export const DEFAULT_INSIGHTS_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export function parseInsightsRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - DEFAULT_INSIGHTS_RANGE_MS);
  return clampInsightsRange(from, to);
}

/**
 * Staff performance insights: when both bounds are calendar days (YYYY-MM-DD), use the same
 * inclusive local range as operations/encounters lists so admin “performed” counts match physician views.
 */
export function resolveStaffPerformanceRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const f = fromStr?.trim() ?? "";
  const t = toStr?.trim() ?? "";
  if (ISO_DAY.test(f) && ISO_DAY.test(t)) {
    const { start, end } = resolveReportingRange(f, t);
    return { from: start, to: end };
  }
  return parseInsightsRange(fromStr, toStr);
}

export function clampInsightsRange(from: Date, to: Date): { from: Date; to: Date } {
  let f = from;
  let t = to;
  if (Number.isNaN(f.getTime())) f = new Date(t.getTime() - DEFAULT_INSIGHTS_RANGE_MS);
  if (Number.isNaN(t.getTime())) t = new Date();
  if (t.getTime() < f.getTime()) {
    const swap = f;
    f = t;
    t = swap;
  }
  if (t.getTime() - f.getTime() > MAX_INSIGHTS_RANGE_MS) {
    f = new Date(t.getTime() - MAX_INSIGHTS_RANGE_MS);
  }
  return { from: f, to: t };
}
