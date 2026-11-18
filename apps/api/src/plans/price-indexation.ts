import type { BillingInterval, PriceUnit } from "@prisma/client";
import { computeSubscriptionAmounts } from "../billing-platform/settlement-calculator";
import { roundMoney } from "../billing-platform/settlement-rounding";
import { addBillingPeriod } from "../subscriptions/subscription-period";

export const DEFAULT_PRICE_CHANGE_NOTICE_DAYS = 30;
export const PRICE_CHANGE_NOTICE_TOPIC = "billing.price_change_notice";
export const PRICE_CHANGE_APPLIED_TOPIC = "billing.price_change_applied";

const DAY_MS = 86_400_000;
/** Notices go out a little early so a late job tick never shortens the notice period. */
const NOTICE_SEND_BUFFER_DAYS = 2;

export type PriceForIndexation = {
  interval: BillingInterval;
  unit: PriceUnit;
  amount: number;
  includedClinicians: number;
  extraClinicianAmount: number | null;
};

/** Market pack `kiorlyBilling.priceChangeNoticeDays` (falls back to 30). */
export function priceChangeNoticeDaysFromFeatureDefaults(featureDefaults: unknown): number {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return DEFAULT_PRICE_CHANGE_NOTICE_DAYS;
  }
  const billing = (featureDefaults as Record<string, unknown>).kiorlyBilling;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) return DEFAULT_PRICE_CHANGE_NOTICE_DAYS;
  const v = (billing as Record<string, unknown>).priceChangeNoticeDays;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : DEFAULT_PRICE_CHANGE_NOTICE_DAYS;
}

/** Subscription cost normalised to one month (annual ÷ 12), including extra clinician seats. */
export function monthlyAmountForPrice(price: PriceForIndexation, clinicianSeats: number): number {
  const amounts = computeSubscriptionAmounts({
    planUnit: price.unit,
    baseAmount: price.amount,
    clinicianSeats,
    includedClinicians: price.includedClinicians,
    extraClinicianAmount: price.extraClinicianAmount,
  });
  const perPeriod = roundMoney(amounts.subscriptionList + amounts.seatDue);
  return price.interval === "ANNUAL" ? roundMoney(perPeriod / 12) : perPeriod;
}

/**
 * First renewal boundary on or after `max(noticeFrom + noticeDays, priceLockUntil)`.
 * A locked (founding) subscription therefore never moves before its lock ends.
 */
export function computePriceMigrationSchedule(input: {
  noticeFrom: Date;
  noticeDays: number;
  currentPeriodEnd: Date;
  interval: BillingInterval;
  priceLockUntil: Date | null;
  /** New price `validFrom` — never move before the price exists. */
  notBefore?: Date;
}): { effectiveAt: Date; noticeDueAt: Date; lockedUntil: Date | null } {
  const noticeReady = new Date(input.noticeFrom.getTime() + input.noticeDays * DAY_MS);
  const lockedUntil =
    input.priceLockUntil && input.priceLockUntil > input.noticeFrom ? input.priceLockUntil : null;
  let earliest = lockedUntil && lockedUntil > noticeReady ? lockedUntil : noticeReady;
  if (input.notBefore && input.notBefore > earliest) earliest = input.notBefore;
  let renewal = new Date(input.currentPeriodEnd);
  let guard = 0;
  while (renewal < earliest && guard < 1200) {
    renewal = addBillingPeriod(renewal, input.interval);
    guard += 1;
  }
  const noticeDueAt = new Date(renewal.getTime() - (input.noticeDays + NOTICE_SEND_BUFFER_DAYS) * DAY_MS);
  return {
    effectiveAt: renewal,
    noticeDueAt: noticeDueAt < input.noticeFrom ? input.noticeFrom : noticeDueAt,
    lockedUntil,
  };
}

/** Apply is allowed only after notice has run its course and any price lock has ended. */
export function canApplyPriceMigration(input: {
  now: Date;
  effectiveAt: Date;
  noticeSentAt: Date | null;
  noticeDays: number;
  priceLockUntil: Date | null;
}): boolean {
  if (input.now < input.effectiveAt) return false;
  if (!input.noticeSentAt) return false;
  if (input.noticeSentAt.getTime() + input.noticeDays * DAY_MS > input.effectiveAt.getTime()) return false;
  if (input.priceLockUntil && input.priceLockUntil > input.effectiveAt) return false;
  return true;
}

export function bilingualPriceChangeNotice(input: {
  planNameEn: string;
  planNameAr: string;
  fromAmount: string;
  toAmount: string;
  currency: string;
  effectiveAt: Date;
}): { en: string; ar: string } {
  const date = input.effectiveAt.toISOString().slice(0, 10);
  return {
    en: `Your Kiorly ${input.planNameEn} price changes from ${input.fromAmount} to ${input.toAmount} ${input.currency} per month on ${date} (your next renewal). No action is needed — continuing your subscription after this date means you accept the new price. You can change or cancel your plan any time before then.`,
    ar: `يتغير سعر خطة كيورلي ${input.planNameAr || input.planNameEn} من ${input.fromAmount} إلى ${input.toAmount} ${input.currency} شهريًا بتاريخ ${date} (موعد التجديد القادم). لا يلزم أي إجراء — استمرار اشتراكك بعد هذا التاريخ يعني موافقتك على السعر الجديد. يمكنك تغيير خطتك أو إلغاؤها في أي وقت قبل ذلك.`,
  };
}
