export const DEFAULT_NEW_PATIENT_LOOKBACK_MONTHS = 24;

export function resolveNewPatientLookbackMonths(marketFeatureDefaults: unknown): number {
  if (!marketFeatureDefaults || typeof marketFeatureDefaults !== "object" || Array.isArray(marketFeatureDefaults)) {
    return DEFAULT_NEW_PATIENT_LOOKBACK_MONTHS;
  }
  const o = marketFeatureDefaults as Record<string, unknown>;
  const block = o.newPatient ?? o.clinical ?? o;
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return DEFAULT_NEW_PATIENT_LOOKBACK_MONTHS;
  }
  const months = (block as Record<string, unknown>).lookbackMonths;
  if (typeof months === "number" && Number.isFinite(months) && months >= 1 && months <= 120) {
    return Math.floor(months);
  }
  return DEFAULT_NEW_PATIENT_LOOKBACK_MONTHS;
}

/**
 * The instant `months` calendar months before `atDate`, computed in UTC (never in the server's zone: a local-time setMonth shifts by an hour across a DST change)
 * and CLAMPED to the last day of the target month (31 Mar minus 1 month is 28 Feb, not 3 Mar: the old setMonth overflow shortened the window by up to 3 days, so a
 * returning patient seen just inside the true window was priced as new).
 */
export function lookbackStartAt(atDate: Date, months: number): Date {
  const y = atDate.getUTCFullYear(), m = atDate.getUTCMonth() - months;
  const targetYear = y + Math.floor(m / 12), targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const d = new Date(atDate.getTime());
  d.setUTCFullYear(targetYear, targetMonth, Math.min(atDate.getUTCDate(), lastDay));
  return d;
}
