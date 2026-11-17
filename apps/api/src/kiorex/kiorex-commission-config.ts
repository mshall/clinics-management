export const DEFAULT_BENCHMARK_TARGET_RATIO = 0.5;

export const DEFAULT_KIOREX_DISPUTE_DEADLINE_DAYS = 30;

export type KiorexMarketPack = {
  benchmarkTargetRatio?: number;
  liteMonthlyCap?: number | null;
  disputeDeadlineDays?: number;
};

export function kiorexPackFromFeatureDefaults(featureDefaults: unknown): KiorexMarketPack {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return {};
  }
  const root = featureDefaults as Record<string, unknown>;
  const block = root.kiorex;
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return {};
  }
  const k = block as Record<string, unknown>;
  const ratio = k.benchmarkTargetRatio;
  const cap = k.liteMonthlyCap;
  const disputeDays = k.disputeDeadlineDays;
  return {
    benchmarkTargetRatio:
      typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio < 2 ? ratio : undefined,
    liteMonthlyCap:
      typeof cap === "number" && Number.isFinite(cap) && cap >= 0 ? cap : cap === null ? null : undefined,
    disputeDeadlineDays:
      typeof disputeDays === "number" && Number.isFinite(disputeDays) && disputeDays > 0
        ? Math.floor(disputeDays)
        : undefined,
  };
}

export function resolveDisputeDeadlineDays(featureDefaults: unknown): number {
  return kiorexPackFromFeatureDefaults(featureDefaults).disputeDeadlineDays ?? DEFAULT_KIOREX_DISPUTE_DEADLINE_DAYS;
}

export function resolveBenchmarkTargetRatio(featureDefaults: unknown): number {
  return kiorexPackFromFeatureDefaults(featureDefaults).benchmarkTargetRatio ?? DEFAULT_BENCHMARK_TARGET_RATIO;
}