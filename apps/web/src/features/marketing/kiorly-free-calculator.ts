/** GT-01 — patients needed so Kiorex commission offsets the SaaS plan price. */
export function patientsToMakeKiorlyFree(planMonthlyAmount: number, feePerPatient: number): number | null {
  if (!Number.isFinite(planMonthlyAmount) || planMonthlyAmount <= 0) return null;
  if (!Number.isFinite(feePerPatient) || feePerPatient <= 0) return null;
  return Math.ceil(planMonthlyAmount / feePerPatient);
}

export type PublicPlanPrice = {
  amount: string;
  currency: string;
  interval: string;
  unit: string;
  cohortKey?: string | null;
};

export type PublicPlan = {
  key: string;
  nameEn: string;
  nameAr: string;
  prices: PublicPlanPrice[];
};

/** Normalize API plan prices for marketing display (must stay byte-identical to API amount strings). */
export function marketingPlanRows(plans: PublicPlan[], lang: "en" | "ar" = "en") {
  return plans.map((p) => ({
    key: p.key,
    name: lang === "ar" ? p.nameAr : p.nameEn,
    prices: p.prices.map((pr) => ({
      amount: pr.amount,
      currency: pr.currency,
      interval: pr.interval,
      unit: pr.unit,
      cohortKey: pr.cohortKey ?? null,
      label: `${pr.amount} ${pr.currency} / ${pr.interval.toLowerCase()}`,
    })),
  }));
}

export function monthlyAmountFromPrice(price: PublicPlanPrice): number {
  const n = Number(price.amount);
  if (!Number.isFinite(n)) return 0;
  return price.interval === "ANNUAL" ? n / 12 : n;
}
