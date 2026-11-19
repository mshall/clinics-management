import type { BillingInterval, PlanKey, PriceUnit } from "@prisma/client";
import { roundMoney } from "../billing-platform/settlement-rounding";
import { computeSubscriptionAmounts } from "../billing-platform/settlement-calculator";

export type PlanPriceShape = {
  amount: number;
  unit: PriceUnit;
  includedClinicians: number;
  extraClinicianAmount: number | null;
  interval: BillingInterval;
};

export type ProrationLine = {
  labelEn: string;
  labelAr: string;
  amount: number;
};

export type PlanChangeProration = {
  currency: string;
  periodStart: string;
  periodEnd: string;
  effectiveAt: string;
  timing: "IMMEDIATE" | "PERIOD_END";
  isUpgrade: boolean;
  credit: string;
  charge: string;
  netDue: string;
  lines: ProrationLine[];
};

const PLAN_RANK: Record<PlanKey, number> = {
  LITE: 0,
  PRO: 1,
  CLINIC: 2,
  ENTERPRISE: 3,
};

export function planTierRank(key: PlanKey): number {
  return PLAN_RANK[key] ?? 0;
}

export function periodAmountForSubscription(input: {
  price: PlanPriceShape;
  clinicianSeats: number;
}): number {
  const parts = computeSubscriptionAmounts({
    planUnit: input.price.unit,
    baseAmount: input.price.amount,
    clinicianSeats: input.clinicianSeats,
    includedClinicians: input.price.includedClinicians,
    extraClinicianAmount: input.price.extraClinicianAmount,
  });
  return roundMoney(parts.subscriptionList + parts.seatDue);
}

/** Fraction of the current billing period that remains (0–1), inclusive of partial days. */
export function remainingPeriodFraction(periodStart: Date, periodEnd: Date, now: Date): number {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const nowMs = now.getTime();
  if (endMs <= startMs) return 0;
  if (nowMs >= endMs) return 0;
  if (nowMs <= startMs) return 1;
  const total = endMs - startMs;
  const remaining = endMs - nowMs;
  return Math.min(1, Math.max(0, remaining / total));
}

export function isPlanUpgrade(current: PlanKey, next: PlanKey, currentAmount: number, nextAmount: number): boolean {
  if (planTierRank(next) > planTierRank(current)) return true;
  if (planTierRank(next) < planTierRank(current)) return false;
  return nextAmount > currentAmount;
}

export function computePlanChangeProration(input: {
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  currentPlanKey: PlanKey;
  currentPrice: PlanPriceShape;
  currentSeats: number;
  nextPlanKey: PlanKey;
  nextPrice: PlanPriceShape;
  nextSeats: number;
  timing: "IMMEDIATE" | "PERIOD_END";
}): PlanChangeProration {
  const fraction = remainingPeriodFraction(input.periodStart, input.periodEnd, input.now);
  const currentFull = periodAmountForSubscription({
    price: input.currentPrice,
    clinicianSeats: input.currentSeats,
  });
  const nextFull = periodAmountForSubscription({
    price: input.nextPrice,
    clinicianSeats: input.nextSeats,
  });
  const isUpgrade = isPlanUpgrade(
    input.currentPlanKey,
    input.nextPlanKey,
    currentFull,
    nextFull,
  );

  if (input.timing === "PERIOD_END") {
    return {
      currency: input.currency,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      effectiveAt: input.periodEnd.toISOString(),
      timing: "PERIOD_END",
      isUpgrade,
      credit: "0.00",
      charge: roundMoney(nextFull).toFixed(2),
      netDue: "0.00",
      lines: [
        {
          labelEn: `New plan starts ${input.periodEnd.toISOString().slice(0, 10)}`,
          labelAr: "الخطة الجديدة تبدأ في نهاية الفترة",
          amount: 0,
        },
      ],
    };
  }

  const credit = roundMoney(currentFull * fraction);
  const charge = roundMoney(nextFull * fraction);
  const netDue = roundMoney(Math.max(0, charge - credit));

  const lines: ProrationLine[] = [
    {
      labelEn: "Credit for unused time on current plan",
      labelAr: "رصيد مقابل الوقت غير المستخدم في الخطة الحالية",
      amount: -credit,
    },
    {
      labelEn: "Charge for new plan for the rest of this period",
      labelAr: "رسوم الخطة الجديدة لبقية هذه الفترة",
      amount: charge,
    },
  ];
  if (input.currentPrice.interval === "ANNUAL" || input.nextPrice.interval === "ANNUAL") {
    lines.push({
      labelEn: "Annual plan: amounts prorated for remaining months in the year",
      labelAr: "خطة سنوية: المبالغ محسوبة تناسبياً لبقية السنة",
      amount: 0,
    });
  }

  return {
    currency: input.currency,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    effectiveAt: input.now.toISOString(),
    timing: "IMMEDIATE",
    isUpgrade,
    credit: credit.toFixed(2),
    charge: charge.toFixed(2),
    netDue: netDue.toFixed(2),
    lines,
  };
}

export function computeSeatChangeProration(input: {
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  price: PlanPriceShape;
  currentSeats: number;
  nextSeats: number;
  timing: "IMMEDIATE" | "PERIOD_END";
}): PlanChangeProration {
  const fraction = remainingPeriodFraction(input.periodStart, input.periodEnd, input.now);
  const currentFull = periodAmountForSubscription({ price: input.price, clinicianSeats: input.currentSeats });
  const nextFull = periodAmountForSubscription({ price: input.price, clinicianSeats: input.nextSeats });
  const isUpgrade = nextFull > currentFull;

  if (input.timing === "PERIOD_END" || !isUpgrade) {
    return {
      currency: input.currency,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      effectiveAt: input.periodEnd.toISOString(),
      timing: "PERIOD_END",
      isUpgrade,
      credit: "0.00",
      charge: roundMoney(nextFull).toFixed(2),
      netDue: "0.00",
      lines: [
        {
          labelEn: "Seat reduction takes effect at period end",
          labelAr: "تخفيض المقاعد يسري في نهاية الفترة",
          amount: 0,
        },
      ],
    };
  }

  const credit = roundMoney(currentFull * fraction);
  const charge = roundMoney(nextFull * fraction);
  const netDue = roundMoney(Math.max(0, charge - credit));

  return {
    currency: input.currency,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    effectiveAt: input.now.toISOString(),
    timing: "IMMEDIATE",
    isUpgrade: true,
    credit: credit.toFixed(2),
    charge: charge.toFixed(2),
    netDue: netDue.toFixed(2),
    lines: [
      {
        labelEn: "Credit for unused seats",
        labelAr: "رصيد مقابل المقاعد غير المستخدمة",
        amount: -credit,
      },
      {
        labelEn: "Charge for additional seats",
        labelAr: "رسوم المقاعد الإضافية",
        amount: charge,
      },
    ],
  };
}