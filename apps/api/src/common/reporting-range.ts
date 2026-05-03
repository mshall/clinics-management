import { BadRequestException } from "@nestjs/common";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Inclusive local calendar range for reporting.
 * If `from` and `to` are omitted or blank, uses the current calendar month.
 */
export function resolveReportingRange(fromStr?: string, toStr?: string): { start: Date; end: Date } {
  const f = fromStr?.trim() ?? "";
  const t = toStr?.trim() ?? "";

  if (f.length === 0 && t.length === 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (f.length === 0 || t.length === 0) {
    throw new BadRequestException("Provide both from and to as YYYY-MM-DD, or omit both for the current month.");
  }

  if (!ISO_DAY.test(f) || !ISO_DAY.test(t)) {
    throw new BadRequestException("Invalid date format. Use YYYY-MM-DD for from and to.");
  }

  const [fy, fm, fd] = f.split("-").map((x) => Number.parseInt(x, 10));
  const [ty, tm, td] = t.split("-").map((x) => Number.parseInt(x, 10));
  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException("Invalid calendar date in from or to.");
  }
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException("from must be on or before to.");
  }

  return { start, end };
}
