import { DEFAULT_KIOREX_DISPUTE_DEADLINE_DAYS } from "../kiorex/kiorex-commission-config";
import { kiorexPackFromFeatureDefaults } from "../kiorex/kiorex-commission-config";
import type { TrialCommissionPolicy } from "./settlement-calculator";

/** Matches `commercialConfig.lite.minInvoice` default; markets override via `kiorlyBilling.liteMinInvoice`. */
export const DEFAULT_LITE_MIN_INVOICE = 100;

export type KiorlyBillingPack = {
  invoiceDueDays?: number;
  liteMinInvoice?: number;
  taxRatePercent?: number;
};

export type SettlementMarketPack = {
  liteMinInvoice: number;
  liteMonthlyCap: number | null;
  taxRatePercent: number;
  trialCommissionPolicy: TrialCommissionPolicy;
};

export function kiorlyBillingPackFromFeatureDefaults(featureDefaults: unknown): KiorlyBillingPack {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return {};
  }
  const root = featureDefaults as Record<string, unknown>;
  const billing = root.kiorlyBilling;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) {
    return {};
  }
  const b = billing as Record<string, unknown>;
  const due = b.invoiceDueDays;
  const liteMin = b.liteMinInvoice;
  const tax = b.taxRatePercent;
  return {
    invoiceDueDays: typeof due === "number" && Number.isFinite(due) && due > 0 ? Math.floor(due) : undefined,
    liteMinInvoice:
      typeof liteMin === "number" && Number.isFinite(liteMin) && liteMin >= 0 ? roundLite(liteMin) : undefined,
    taxRatePercent: typeof tax === "number" && Number.isFinite(tax) && tax >= 0 ? tax : undefined,
  };
}

function roundLite(n: number): number {
  return n;
}

/** Map trial pack commissionPolicy strings to settlement enum (CR-06). */
export function trialCommissionPolicyFromMarket(
  featureDefaults: unknown,
  trialOverride?: unknown,
): TrialCommissionPolicy {
  const readPolicy = (raw: unknown): string | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const block = (raw as Record<string, unknown>).trial;
    const obj = block && typeof block === "object" && !Array.isArray(block) ? (block as Record<string, unknown>) : raw;
    const p = (obj as Record<string, unknown>).commissionPolicy;
    return typeof p === "string" ? p : undefined;
  };
  const overridePolicy =
    trialOverride && typeof trialOverride === "object" && !Array.isArray(trialOverride)
      ? (trialOverride as Record<string, unknown>).commissionPolicy
      : undefined;
  const raw = (typeof overridePolicy === "string" ? overridePolicy : undefined) ?? readPolicy(featureDefaults);
  return normalizeTrialCommissionPolicy(raw);
}

export function normalizeTrialCommissionPolicy(raw?: string | null): TrialCommissionPolicy {
  const v = raw?.trim().toUpperCase().replace(/-/g, "_");
  if (v === "WAIVE_ALL" || v === "WAIVED") return "WAIVE_ALL";
  if (v === "CHARGE" || v === "STANDARD") return "CHARGE";
  return "WAIVE_UP_TO_PLAN_PRICE";
}

export function resolveSettlementMarketPack(featureDefaults: unknown, trialOverride?: unknown): SettlementMarketPack {
  const billing = kiorlyBillingPackFromFeatureDefaults(featureDefaults);
  const kiorex = kiorexPackFromFeatureDefaults(featureDefaults);
  return {
    liteMinInvoice: billing.liteMinInvoice ?? DEFAULT_LITE_MIN_INVOICE,
    liteMonthlyCap: kiorex.liteMonthlyCap ?? null,
    taxRatePercent: billing.taxRatePercent ?? 0,
    trialCommissionPolicy: trialCommissionPolicyFromMarket(featureDefaults, trialOverride),
  };
}

/** Unused import guard for eslint — dispute days live in kiorex pack for other features */
void DEFAULT_KIOREX_DISPUTE_DEADLINE_DAYS;