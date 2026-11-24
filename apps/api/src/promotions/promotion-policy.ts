/**
 * SPONSORED_PROMOTION_POLICY as the Clinic reads it (GRW-P2-S). The authoritative config kind lives in the Kiorex growth configuration (maker-checker, two approvers, effective 7 days after approval,
 * contracts 1.12.0). There is no config push channel to the Clinic yet, so the Clinic reads the same keys from the market `featureDefaults.sponsoredPromotions` (PROPOSED_DEFAULT below, founder
 * and finance to confirm: H-25 to H-28) and cites `policyVersion` on every promotion version and every commission decision. Amounts in minor units.
 */
export interface SponsoredPromotionPolicy {
  policyVersion: string;
  commissionBasis: "GROSS_BEFORE_SPONSORED" | "NET_AFTER_SPONSORED";
  highValueBudgetMinor: number; highValuePerBookingMinor: number; maxDiscountBp: number;
  allowedCareTypes: Array<"IN_CLINIC" | "VIDEO" | "HOME_VISIT">;
  defaultFundingMode: "WALLET_ONLY" | "WALLET_THEN_INVOICE";
  postToPayLedger: boolean; reservationTtlGraceMinutes: number; reviewRequired: boolean;
  priceInflationWindowDays: number; priceInflationBp: number;
  fraudRuleWeights: Record<string, number>; fraudEnforce: string[];
}
export const PROPOSED_DEFAULT_POLICY: SponsoredPromotionPolicy = {
  policyVersion: "SPP-PROPOSED-DEFAULT", commissionBasis: "GROSS_BEFORE_SPONSORED",
  highValueBudgetMinor: 5_000_000, highValuePerBookingMinor: 50_000, maxDiscountBp: 3000,
  allowedCareTypes: ["IN_CLINIC", "VIDEO", "HOME_VISIT"], defaultFundingMode: "WALLET_ONLY", postToPayLedger: false, reservationTtlGraceMinutes: 15, reviewRequired: true,
  priceInflationWindowDays: 30, priceInflationBp: 500,
  fraudRuleWeights: { PF_SELF_DEAL: 90, PF_FARM: 60, PF_PRICE_INFLATION: 70, PF_NO_ATTENDANCE: 100, PF_VELOCITY: 40, PF_COLLUSION_LOOP: 60, PF_CLINICAL_INDUCEMENT: 80 },
  fraudEnforce: ["PF_SELF_DEAL", "PF_PRICE_INFLATION", "PF_NO_ATTENDANCE", "PF_CLINICAL_INDUCEMENT"],
};

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
/** Reads `featureDefaults.sponsoredPromotions`; every key is validated and falls back to the default, and `reviewRequired` can never be switched off. */
export function resolvePolicy(featureDefaults: unknown): SponsoredPromotionPolicy {
  const d = PROPOSED_DEFAULT_POLICY;
  const root = featureDefaults && typeof featureDefaults === "object" ? (featureDefaults as Record<string, unknown>).sponsoredPromotions : null;
  if (!root || typeof root !== "object") return d;
  const o = root as Record<string, unknown>;
  const care = Array.isArray(o.allowedCareTypes) ? (o.allowedCareTypes.filter((c) => c === "IN_CLINIC" || c === "VIDEO" || c === "HOME_VISIT") as SponsoredPromotionPolicy["allowedCareTypes"]) : [];
  return {
    policyVersion: typeof o.policyVersion === "string" && o.policyVersion.length <= 64 ? o.policyVersion : d.policyVersion,
    commissionBasis: o.commissionBasis === "NET_AFTER_SPONSORED" ? "NET_AFTER_SPONSORED" : "GROSS_BEFORE_SPONSORED",
    highValueBudgetMinor: int(o.highValueBudgetMinor, 0, 100_000_000_000, d.highValueBudgetMinor), highValuePerBookingMinor: int(o.highValuePerBookingMinor, 0, 100_000_000, d.highValuePerBookingMinor), maxDiscountBp: int(o.maxDiscountBp, 1, 10_000, d.maxDiscountBp),
    allowedCareTypes: care.length ? care : d.allowedCareTypes, defaultFundingMode: o.defaultFundingMode === "WALLET_THEN_INVOICE" ? "WALLET_THEN_INVOICE" : "WALLET_ONLY",
    postToPayLedger: o.postToPayLedger === true, reservationTtlGraceMinutes: int(o.reservationTtlGraceMinutes, 0, 1440, d.reservationTtlGraceMinutes), reviewRequired: true,
    priceInflationWindowDays: int(o.priceInflationWindowDays, 1, 365, d.priceInflationWindowDays), priceInflationBp: int(o.priceInflationBp, 0, 10_000, d.priceInflationBp),
    fraudRuleWeights: { ...d.fraudRuleWeights }, fraudEnforce: Array.isArray(o.fraudEnforce) ? (o.fraudEnforce.filter((x) => typeof x === "string") as string[]) : d.fraudEnforce,
  };
}
