/** SB-03 dunning timeline defaults (overridable per market pack). */
export const DEFAULT_DUNNING_TIMELINE = {
  /** Invoice payment reminder offsets before due date (days). */
  reminderDaysBeforeDue: [3, 0] as const,
  /** Invoice payment reminder offsets AFTER the due date (days, each >= 1). Empty by default: no behaviour change. */
  reminderDaysAfterDue: [] as readonly number[],
  /** First calendar day after due when subscription enters past-due dunning. */
  pastDueFromDay: 1,
  /** Last day of grace (inclusive) — full product access with banner. */
  graceEndDay: 14,
  readOnlyFromDay: 15,
  suspendedFromDay: 45,
  // SB-05 decision (26 Nov 2026): collecting an unpaid Kiorex commission never pauses or hides the Kiorex listing, so there is no
  // "pause after N days" setting here (a safety control is a code rule, never a market-pack knob). A stale
  // `liteCommissionMarketplacePauseDays` in an old market pack is ignored.
} as const;

export type DunningTimelineConfig = {
  reminderDaysBeforeDue: number[];
  reminderDaysAfterDue: number[];
  pastDueFromDay: number;
  graceEndDay: number;
  readOnlyFromDay: number;
  suspendedFromDay: number;
};

function cloneDefaults(): DunningTimelineConfig {
  return {
    ...DEFAULT_DUNNING_TIMELINE,
    reminderDaysBeforeDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysBeforeDue],
    reminderDaysAfterDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysAfterDue],
  };
}

function readDays(v: unknown, min: number, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const days = v
    .map((x) => (typeof x === "number" && Number.isFinite(x) ? Math.floor(x) : NaN))
    .filter((x) => Number.isFinite(x) && x >= min && x <= 90);
  return [...new Set(days)];
}

export function dunningTimelineFromFeatureDefaults(featureDefaults: unknown): DunningTimelineConfig {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return cloneDefaults();
  }
  const billing = (featureDefaults as Record<string, unknown>).kiorlyBilling;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) {
    return cloneDefaults();
  }
  const d = (billing as Record<string, unknown>).dunning;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    return cloneDefaults();
  }
  const row = d as Record<string, unknown>;
  const readInt = (key: string, fallback: number) => {
    const v = row[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
  };
  return {
    reminderDaysBeforeDue: readDays(row.reminderDaysBeforeDue, 0, [...DEFAULT_DUNNING_TIMELINE.reminderDaysBeforeDue]),
    reminderDaysAfterDue: readDays(row.reminderDaysAfterDue, 1, [...DEFAULT_DUNNING_TIMELINE.reminderDaysAfterDue]),
    pastDueFromDay: readInt("pastDueFromDay", DEFAULT_DUNNING_TIMELINE.pastDueFromDay),
    graceEndDay: readInt("graceEndDay", DEFAULT_DUNNING_TIMELINE.graceEndDay),
    readOnlyFromDay: readInt("readOnlyFromDay", DEFAULT_DUNNING_TIMELINE.readOnlyFromDay),
    suspendedFromDay: readInt("suspendedFromDay", DEFAULT_DUNNING_TIMELINE.suspendedFromDay),
  };
}