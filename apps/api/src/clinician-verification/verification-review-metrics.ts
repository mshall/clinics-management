/** Median of positive review durations (ms). PA-03 acceptance metric. */
export function medianReviewDurationMs(samples: readonly number[]): number | null {
  const values = samples.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[mid]!;
  return Math.round((values[mid - 1]! + values[mid]!) / 2);
}

export function waitingDurationMs(pendingAt: Date, now = new Date()): number {
  return Math.max(0, now.getTime() - pendingAt.getTime());
}

export function slaBreached(pendingAt: Date, slaHours: number, now = new Date()): boolean {
  return waitingDurationMs(pendingAt, now) > slaHours * 60 * 60 * 1000;
}