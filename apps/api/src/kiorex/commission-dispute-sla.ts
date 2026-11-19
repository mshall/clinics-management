/** SLA for manual commission dispute review (working days, exclusive of weekends). */
export const COMMISSION_DISPUTE_SLA_WORKING_DAYS = 3;

export const DEFAULT_WEEKEND_DAYS = [5, 6];

export function addWorkingDays(from: Date, workingDays: number, weekendDays: number[]): Date {
  const weekend = new Set(weekendDays.length ? weekendDays : DEFAULT_WEEKEND_DAYS);
  const due = new Date(from);
  let added = 0;
  while (added < workingDays) {
    due.setUTCDate(due.getUTCDate() + 1);
    if (!weekend.has(due.getUTCDay())) added++;
  }
  return due;
}

export function disputeSlaDueAt(createdAt: Date, weekendDays?: number[]): Date {
  return addWorkingDays(createdAt, COMMISSION_DISPUTE_SLA_WORKING_DAYS, weekendDays ?? DEFAULT_WEEKEND_DAYS);
}

export function disputeSlaBreached(createdAt: Date, weekendDays?: number[]): boolean {
  return new Date() > disputeSlaDueAt(createdAt, weekendDays);
}