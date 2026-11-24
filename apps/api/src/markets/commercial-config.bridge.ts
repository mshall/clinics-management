import type { CommercialConfig } from "./commercial-config.schema";
import { CREDIT_CONFIG_DEFAULTS, DEFAULT_COMMERCIAL_CONFIG, type CreditConfig } from "./commercial-config.schema";

export function commercialConfigToFeatureDefaultsPatch(config: CommercialConfig): Record<string, unknown> {
  const trialPolicy =
    config.trial.commissionPolicy === "WAIVE_UP_TO_PLAN_PRICE"
      ? "waived"
      : config.trial.commissionPolicy === "WAIVE_ALL"
        ? "WAIVE_ALL"
        : config.trial.commissionPolicy;

  return {
    trial: {
      standardDays: config.trial.standardDays,
      foundingDays: config.trial.foundingDays,
      minQualifyingVisits: config.trial.activation.minVisits,
      activationWindowDays: config.trial.activation.withinDays,
      commissionPolicy: trialPolicy,
      cohorts: config.trial.cohorts ?? [],
    },
    kiorex: {
      benchmarkTargetRatio: config.kiorex.benchmarkTargetRatio,
      liteMonthlyCap: config.lite.commissionMonthlyCap,
      disputeDeadlineDays: config.kiorex.disputeWindowDays,
      autoConfirmHours: config.kiorex.autoConfirmHours,
    },
    newPatient: {
      lookbackMonths: config.kiorex.newPatientLookbackMonths,
    },
    kiorlyBilling: {
      liteMinInvoice: config.lite.minInvoice,
      dunning: {
        pastDueFromDay: 1,
        graceEndDay: config.dunning.graceDays,
        readOnlyFromDay: config.dunning.readOnlyAfterDays,
        suspendedFromDay: config.dunning.suspendAfterDays,
        liteCommissionMarketplacePauseDays: 30,
        reminderDaysBeforeDue: [3, 0],
      },
    },
    referral: {
      rewardMonths: config.referral.rewardMonths,
      expiryMonths: config.referral.expiryMonths,
      maxPerYear: config.referral.maxPerYear,
    },
    ...(config.credit ? { credit: { ...config.credit } } : {}),
  };
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

/** Best-effort import from legacy `featureDefaults` when `commercialConfig` is empty. */
export function commercialConfigFromFeatureDefaults(featureDefaults: unknown): CommercialConfig {
  const base = structuredClone(DEFAULT_COMMERCIAL_CONFIG);
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return base;
  }
  const root = featureDefaults as Record<string, unknown>;
  const trial =
    root.trial && typeof root.trial === "object" && !Array.isArray(root.trial)
      ? (root.trial as Record<string, unknown>)
      : {};
  base.trial.standardDays = readNumber(trial, "standardDays") ?? base.trial.standardDays;
  base.trial.foundingDays = readNumber(trial, "foundingDays") ?? base.trial.foundingDays;
  base.trial.activation.minVisits = readNumber(trial, "minQualifyingVisits") ?? base.trial.activation.minVisits;
  base.trial.activation.withinDays = readNumber(trial, "activationWindowDays") ?? base.trial.activation.withinDays;
  const policy = trial.commissionPolicy;
  if (typeof policy === "string") {
    base.trial.commissionPolicy =
      policy === "waived"
        ? "WAIVE_UP_TO_PLAN_PRICE"
        : (policy as CommercialConfig["trial"]["commissionPolicy"]);
  }
  if (Array.isArray(trial.cohorts)) {
    base.trial.cohorts = trial.cohorts
      .filter((r): r is Record<string, unknown> => r && typeof r === "object" && !Array.isArray(r))
      .map((r) => ({
        key: String(r.key ?? ""),
        trialDays: Number(r.trialDays) || 90,
      }))
      .filter((r) => r.key.length > 0);
  }

  const kiorex =
    root.kiorex && typeof root.kiorex === "object" && !Array.isArray(root.kiorex)
      ? (root.kiorex as Record<string, unknown>)
      : {};
  base.kiorex.benchmarkTargetRatio = readNumber(kiorex, "benchmarkTargetRatio") ?? base.kiorex.benchmarkTargetRatio;
  base.kiorex.disputeWindowDays = readNumber(kiorex, "disputeDeadlineDays") ?? base.kiorex.disputeWindowDays;
  base.kiorex.autoConfirmHours = readNumber(kiorex, "autoConfirmHours") ?? base.kiorex.autoConfirmHours;

  const np =
    root.newPatient && typeof root.newPatient === "object" && !Array.isArray(root.newPatient)
      ? (root.newPatient as Record<string, unknown>)
      : {};
  base.kiorex.newPatientLookbackMonths = readNumber(np, "lookbackMonths") ?? base.kiorex.newPatientLookbackMonths;

  const billing =
    root.kiorlyBilling && typeof root.kiorlyBilling === "object" && !Array.isArray(root.kiorlyBilling)
      ? (root.kiorlyBilling as Record<string, unknown>)
      : {};
  base.lite.minInvoice = readNumber(billing, "liteMinInvoice") ?? base.lite.minInvoice;
  base.lite.commissionMonthlyCap =
    kiorex.liteMonthlyCap === null
      ? null
      : (readNumber(kiorex, "liteMonthlyCap") ?? base.lite.commissionMonthlyCap);

  const dunning =
    billing.dunning && typeof billing.dunning === "object" && !Array.isArray(billing.dunning)
      ? (billing.dunning as Record<string, unknown>)
      : {};
  base.dunning.graceDays = readNumber(dunning, "graceEndDay") ?? base.dunning.graceDays;
  base.dunning.readOnlyAfterDays = readNumber(dunning, "readOnlyFromDay") ?? base.dunning.readOnlyAfterDays;
  base.dunning.suspendAfterDays = readNumber(dunning, "suspendedFromDay") ?? base.dunning.suspendAfterDays;

  const referral =
    root.referral && typeof root.referral === "object" && !Array.isArray(root.referral)
      ? (root.referral as Record<string, unknown>)
      : {};
  base.referral.rewardMonths = readNumber(referral, "rewardMonths") ?? base.referral.rewardMonths;
  base.referral.expiryMonths = readNumber(referral, "expiryMonths") ?? base.referral.expiryMonths;
  base.referral.maxPerYear = readNumber(referral, "maxPerYear") ?? base.referral.maxPerYear;

  if (root.credit && typeof root.credit === "object" && !Array.isArray(root.credit)) {
    const c = root.credit as Record<string, unknown>;
    base.credit = {
      onboardingAmount: readNumber(c, "onboardingAmount") ?? CREDIT_CONFIG_DEFAULTS.onboardingAmount,
      connectBonusAmount: readNumber(c, "connectBonusAmount") ?? CREDIT_CONFIG_DEFAULTS.connectBonusAmount,
      promotionalExpiryMonths: readNumber(c, "promotionalExpiryMonths") ?? CREDIT_CONFIG_DEFAULTS.promotionalExpiryMonths,
      recoveryExpiryMonths: readNumber(c, "recoveryExpiryMonths") ?? CREDIT_CONFIG_DEFAULTS.recoveryExpiryMonths,
      usageBundlesEnabled: c.usageBundlesEnabled === true,
    };
  }

  return base;
}

export function mergeFeatureDefaults(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const deepMerge = (target: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const cur = target[k];
        const next =
          cur && typeof cur === "object" && !Array.isArray(cur)
            ? { ...(cur as Record<string, unknown>) }
            : {};
        deepMerge(next, v as Record<string, unknown>);
        target[k] = next;
      } else {
        target[k] = v;
      }
    }
  };
  const out = { ...base };
  deepMerge(out, patch);
  return out;
}

export function commercialConfigPreviewDiff(before: CommercialConfig, after: CommercialConfig): string[] {
  const keys: string[] = [];
  const walk = (path: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) keys.push(path);
  };
  walk("trial.standardDays", before.trial.standardDays, after.trial.standardDays);
  walk("trial.foundingDays", before.trial.foundingDays, after.trial.foundingDays);
  walk("trial.activation", before.trial.activation, after.trial.activation);
  walk("trial.commissionPolicy", before.trial.commissionPolicy, after.trial.commissionPolicy);
  walk("trial.cohorts", before.trial.cohorts, after.trial.cohorts);
  walk("kiorex", before.kiorex, after.kiorex);
  walk("lite", before.lite, after.lite);
  walk("dunning", before.dunning, after.dunning);
  walk("referral", before.referral, after.referral);
  walk("credit", before.credit, after.credit);
  return keys;
}

export function referralConfigFromMarket(featureDefaults: unknown): CommercialConfig["referral"] {
  return commercialConfigFromFeatureDefaults(featureDefaults).referral;
}

/** GRW-P2-W: the market's provider-credit config (defaults: no platform grants, 12 and 24 month expiry). */
export function creditConfigFromMarket(featureDefaults: unknown): CreditConfig {
  return commercialConfigFromFeatureDefaults(featureDefaults).credit ?? { ...CREDIT_CONFIG_DEFAULTS };
}
