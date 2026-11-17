export type TrialCommissionPolicy = "waived" | "standard" | string;

export type TrialPackConfig = {
  foundingDays: number;
  standardDays: number;
  activationWindowDays: number;
  minQualifyingVisits: number;
  shortenWarningDay: number;
  endNoticeDays: number[];
  postTrialGraceDays: number;
  commissionPolicy: TrialCommissionPolicy;
};

export type TrialConfigOverride = Partial<TrialPackConfig> & {
  cohortTrialDays?: number;
};

export const DEFAULT_TRIAL_PACK: TrialPackConfig = {
  foundingDays: 180,
  standardDays: 90,
  activationWindowDays: 30,
  minQualifyingVisits: 20,
  shortenWarningDay: 21,
  endNoticeDays: [14, 7, 3, 0],
  postTrialGraceDays: 7,
  commissionPolicy: "waived",
};

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function readTrialBlock(raw: unknown): Partial<TrialPackConfig> & { cohorts?: unknown } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const trial = o.trial;
  const block =
    trial && typeof trial === "object" && !Array.isArray(trial) ? (trial as Record<string, unknown>) : o;
  const endNoticeDays = block.endNoticeDays;
  return {
    foundingDays: readNumber(block, "foundingDays"),
    standardDays: readNumber(block, "standardDays"),
    activationWindowDays: readNumber(block, "activationWindowDays"),
    minQualifyingVisits: readNumber(block, "minQualifyingVisits"),
    shortenWarningDay: readNumber(block, "shortenWarningDay"),
    postTrialGraceDays: readNumber(block, "postTrialGraceDays"),
    commissionPolicy:
      typeof block.commissionPolicy === "string" ? block.commissionPolicy : undefined,
    endNoticeDays: Array.isArray(endNoticeDays)
      ? endNoticeDays.filter((d): d is number => typeof d === "number" && Number.isFinite(d))
      : undefined,
    cohorts: block.cohorts,
  };
}

export function cohortTrialDaysFromMarket(
  featureDefaults: unknown,
  cohortKey: string | null | undefined,
): number | undefined {
  if (!cohortKey) return undefined;
  const partial = readTrialBlock(featureDefaults);
  const cohorts = partial.cohorts;
  if (!Array.isArray(cohorts)) return undefined;
  for (const row of cohorts) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    if (r.key === cohortKey) {
      return readNumber(r, "trialDays");
    }
  }
  return undefined;
}

export function resolveTrialConfig(input: {
  marketFeatureDefaults?: unknown;
  cohortKey?: string | null;
  override?: TrialConfigOverride | null;
}): TrialPackConfig {
  const fromMarket = readTrialBlock(input.marketFeatureDefaults ?? {});
  const cohortDays = cohortTrialDaysFromMarket(input.marketFeatureDefaults, input.cohortKey);
  const override = input.override ?? {};
  const merged: TrialPackConfig = {
    ...DEFAULT_TRIAL_PACK,
    foundingDays: fromMarket.foundingDays ?? DEFAULT_TRIAL_PACK.foundingDays,
    standardDays: fromMarket.standardDays ?? DEFAULT_TRIAL_PACK.standardDays,
    activationWindowDays: fromMarket.activationWindowDays ?? DEFAULT_TRIAL_PACK.activationWindowDays,
    minQualifyingVisits: fromMarket.minQualifyingVisits ?? DEFAULT_TRIAL_PACK.minQualifyingVisits,
    shortenWarningDay: fromMarket.shortenWarningDay ?? DEFAULT_TRIAL_PACK.shortenWarningDay,
    postTrialGraceDays: fromMarket.postTrialGraceDays ?? DEFAULT_TRIAL_PACK.postTrialGraceDays,
    commissionPolicy: fromMarket.commissionPolicy ?? DEFAULT_TRIAL_PACK.commissionPolicy,
    endNoticeDays: fromMarket.endNoticeDays ?? [...DEFAULT_TRIAL_PACK.endNoticeDays],
    ...override,
  };
  if (cohortDays != null && override.foundingDays == null && override.standardDays == null) {
    merged.foundingDays = cohortDays;
  }
  if (override.cohortTrialDays != null) {
    merged.foundingDays = override.cohortTrialDays;
  }
  const noticeDays = override.endNoticeDays ?? merged.endNoticeDays ?? DEFAULT_TRIAL_PACK.endNoticeDays;
  merged.endNoticeDays = [...noticeDays].sort((a, b) => b - a);
  return merged;
}

export function initialTrialEndsAt(trialStartsAt: Date, config: TrialPackConfig, cohortTrialDays?: number | null): Date {
  const days = cohortTrialDays ?? config.foundingDays;
  return new Date(trialStartsAt.getTime() + days * 86_400_000);
}

export function standardTrialEndsAt(trialStartsAt: Date, config: TrialPackConfig): Date {
  return new Date(trialStartsAt.getTime() + config.standardDays * 86_400_000);
}

export function foundingTrialEndsAt(trialStartsAt: Date, config: TrialPackConfig): Date {
  return new Date(trialStartsAt.getTime() + config.foundingDays * 86_400_000);
}