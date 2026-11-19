/** GT-05 — sales ROI calculator (no-shows, admin time, Kiorex patients). */

export type SalesRoiInput = {
  /** Expected no-shows prevented per month. */
  noShowsPreventedPerMonth: number;
  /** Average fee lost per no-show (market currency major units). */
  feePerVisit: number;
  /** Admin hours saved per week from automation. */
  adminHoursSavedPerWeek: number;
  /** Fully loaded hourly cost of admin staff. */
  adminHourlyCost: number;
  /** Extra Kiorex marketplace patients per month. */
  kiorexPatientsPerMonth: number;
  /** Average net contribution per Kiorex patient after fee. */
  contributionPerKiorexPatient: number;
  /** Monthly SaaS plan price. */
  planMonthlyAmount: number;
};

export type SalesRoiResult = {
  noShowSavings: number;
  adminSavings: number;
  kiorexContribution: number;
  grossMonthlyBenefit: number;
  planMonthlyAmount: number;
  netMonthlyBenefit: number;
  paybackMonths: number | null;
  patientsToOffsetPlan: number | null;
};

export function computeSalesRoi(input: SalesRoiInput): SalesRoiResult {
  const noShowSavings = Math.max(0, input.noShowsPreventedPerMonth) * Math.max(0, input.feePerVisit);
  const adminSavings = Math.max(0, input.adminHoursSavedPerWeek) * 4.333 * Math.max(0, input.adminHourlyCost);
  const kiorexContribution =
    Math.max(0, input.kiorexPatientsPerMonth) * Math.max(0, input.contributionPerKiorexPatient);
  const grossMonthlyBenefit = round2(noShowSavings + adminSavings + kiorexContribution);
  const plan = Math.max(0, input.planMonthlyAmount);
  const netMonthlyBenefit = round2(grossMonthlyBenefit - plan);
  const paybackMonths =
    netMonthlyBenefit > 0 ? round2(plan / netMonthlyBenefit) : netMonthlyBenefit === 0 && plan === 0 ? 0 : null;
  const patientsToOffsetPlan =
    input.contributionPerKiorexPatient > 0 ? Math.ceil(plan / input.contributionPerKiorexPatient) : null;
  return {
    noShowSavings: round2(noShowSavings),
    adminSavings: round2(adminSavings),
    kiorexContribution: round2(kiorexContribution),
    grossMonthlyBenefit,
    planMonthlyAmount: round2(plan),
    netMonthlyBenefit,
    paybackMonths,
    patientsToOffsetPlan,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
