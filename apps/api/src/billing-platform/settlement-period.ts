export type BillingPeriod = {
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
};

/** Calendar month UTC: `YYYY-MM` → [start, end). */
export function parseBillingPeriod(periodKey: string): BillingPeriod {
  const trimmed = periodKey.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) throw new Error(`Invalid period key: ${periodKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid period month: ${periodKey}`);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { periodKey: `${year}-${String(month).padStart(2, "0")}`, periodStart, periodEnd };
}

/** Previous calendar month key in Africa/Cairo (approximated via UTC month for billing period key). */
export function previousPeriodKey(reference = new Date()): string {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const prev = m === 0 ? { year: y - 1, month: 12 } : { year: y, month: m };
  return `${prev.year}-${String(prev.month).padStart(2, "0")}`;
}