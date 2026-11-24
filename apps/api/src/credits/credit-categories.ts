import type { CreditCategory, CreditReason } from "@prisma/client";

/**
 * GRW-P2-W (ADR-048, KX-30 14.3): what provider credit may pay for. A "use" is the spending side; a category is the earning side.
 * PROVIDER credit only: nothing here knows a patient, a deposit or a patient ledger.
 */
export const CREDIT_USES = ["KIOREX_FEES", "SUBSCRIPTION", "USAGE", "PROMOTIONS", "MARKETING"] as const;
export type CreditUse = (typeof CREDIT_USES)[number];

/** Reason -> use (CONSUME side). */
export const USE_OF_REASON: Partial<Record<CreditReason, CreditUse>> = {
  KIOREX_FEE_OFFSET: "KIOREX_FEES",
  SUBSCRIPTION_OFFSET: "SUBSCRIPTION",
  USAGE_PURCHASE: "USAGE",
  SPONSORED_PROMOTION: "PROMOTIONS",
  MARKETING_SPEND: "MARKETING",
};

/** Category per GRANT reason (existing reasons keep their meaning; new reasons are additive). */
export function categoryOfReason(reason: CreditReason): CreditCategory {
  switch (reason) {
    case "KIOREX_LATE_REVERSAL":
    case "DISPUTE_WIN":
    case "GOODWILL":
    case "NO_SHOW_GUARANTEE":
    case "DOWNGRADE_PRORATION":
    case "SPONSORED_PROMOTION_REVERSAL":
      return "SERVICE_RECOVERY";
    case "ONBOARDING":
    case "CONNECT_BONUS":
      return "ONBOARDING";
    case "REFERRAL":
      return "REFERRAL";
    case "PROMO":
      return "PROMOTIONAL";
    default:
      return "ADJUSTMENT";
  }
}

/** Spendable-on list per category. Returned fee credit and recovery credit can pay for anything the provider owes Kiorex or funds itself; promotional credit is for fees and usage. */
export const SPENDABLE_ON: Record<CreditCategory, readonly CreditUse[]> = {
  SERVICE_RECOVERY: ["KIOREX_FEES", "SUBSCRIPTION", "USAGE", "PROMOTIONS", "MARKETING"],
  ONBOARDING: ["KIOREX_FEES", "SUBSCRIPTION", "USAGE"],
  PROMOTIONAL: ["KIOREX_FEES", "SUBSCRIPTION", "USAGE", "PROMOTIONS"],
  REFERRAL: ["KIOREX_FEES", "SUBSCRIPTION", "USAGE"],
  ADJUSTMENT: ["KIOREX_FEES", "SUBSCRIPTION", "USAGE", "PROMOTIONS", "MARKETING"],
};

/** Categories whose credit is promotional: W-4 they always expire, W-3 they are never paid out. */
export const PROMOTIONAL_CATEGORIES: readonly CreditCategory[] = ["ONBOARDING", "PROMOTIONAL", "REFERRAL"];

export type LotRestrictions = { spendableOn?: CreditUse[] } | null | undefined;

export function spendableOnFor(category: CreditCategory | null | undefined, reason: CreditReason, restrictions?: LotRestrictions): readonly CreditUse[] {
  const base = SPENDABLE_ON[category ?? categoryOfReason(reason)];
  const only = restrictions?.spendableOn;
  return only && only.length ? base.filter((u) => only.includes(u)) : base;
}

export function lotSpendableFor(lot: { category?: CreditCategory | null; reason: CreditReason; restrictions?: unknown }, use: CreditUse): boolean {
  const r = lot.restrictions && typeof lot.restrictions === "object" ? (lot.restrictions as LotRestrictions) : null;
  return spendableOnFor(lot.category, lot.reason, r).includes(use);
}

/** Default expiry in months when a caller gives none (market config `credit.promotionalExpiryMonths` / `recoveryExpiryMonths` override). */
export const DEFAULT_PROMOTIONAL_EXPIRY_MONTHS = 12;
export const DEFAULT_RECOVERY_EXPIRY_MONTHS = 24;

export function defaultExpiryFor(category: CreditCategory, from: Date, cfg?: { promotionalExpiryMonths?: number; recoveryExpiryMonths?: number }): Date {
  const months = PROMOTIONAL_CATEGORIES.includes(category)
    ? (cfg?.promotionalExpiryMonths ?? DEFAULT_PROMOTIONAL_EXPIRY_MONTHS)
    : (cfg?.recoveryExpiryMonths ?? DEFAULT_RECOVERY_EXPIRY_MONTHS);
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** W-8 guard: a ledger reference must never name a patient-credit object (Kiorex patient ledger, reward, coupon, wallet of a patient). */
const PATIENT_REF = /(^|[:_\-/])(patient|pcl|pcredit|reward|coupon|kxcl|kx_pc|sub)([:_\-/]|$)/i;
export function namesPatientLedgerObject(ref: string | null | undefined): boolean {
  return !!ref && PATIENT_REF.test(ref);
}

/** The reason a billed Kiorex fee returns as credit with: a dispute win, a waiver (goodwill) or the generic late reversal. Pure so it can be table-tested. */
export function reasonForFeeReturn(reversalReason: string): CreditReason {
  if (reversalReason === "dispute_approved") return "DISPUTE_WIN";
  if (reversalReason.startsWith("override_")) return "GOODWILL";
  return "KIOREX_LATE_REVERSAL";
}

/** Reasons a platform super admin may grant by hand (the spend-side and engine-only reasons are never grantable by hand). */
export const MANUAL_GRANT_REASONS: readonly CreditReason[] = ["GOODWILL", "PROMO", "ONBOARDING", "CONNECT_BONUS", "REFERRAL", "DISPUTE_WIN", "KIOREX_LATE_REVERSAL", "NO_SHOW_GUARANTEE", "DOWNGRADE_PRORATION", "ADJUSTMENT"];
