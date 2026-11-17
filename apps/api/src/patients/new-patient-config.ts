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

export function lookbackStartAt(atDate: Date, months: number): Date {
  const d = new Date(atDate);
  d.setMonth(d.getMonth() - months);
  return d;
}