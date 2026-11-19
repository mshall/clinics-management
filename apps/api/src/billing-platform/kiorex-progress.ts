import { roundMoney } from "./settlement-rounding";
import type { SettlementCalculatorResult } from "./settlement-calculator";

export type KiorexFreeProgress = {
  periodKey: string;
  currency: string;
  patientsAttended: number;
  /** Kiorex patients needed so commission covers subscription this period. */
  patientsTarget: number;
  patientsStillNeeded: number;
  /** Average commission per attended Kiorex patient this period. */
  feePerPatient: number;
  subscriptionAmount: number;
  commissionGross: number;
  offsetAmount: number;
  progressPercent: number;
  isFreeThisMonth: boolean;
  settlementSummary: SettlementCalculatorResult["summary"];
};

export function kiorexFreeProgressFromSettlement(
  periodKey: string,
  currency: string,
  calculation: SettlementCalculatorResult,
): KiorexFreeProgress {
  const summary = calculation.summary;
  const subscriptionAmount = Number(summary.subscriptionForHigherOf);
  const commissionGross = Number(summary.commissionGross);
  const offsetAmount = Number(summary.offsetAmount);
  const attended = summary.kiorexPatientCount;

  const feePerPatient =
    attended > 0 ? roundMoney(commissionGross / attended) : commissionGross > 0 ? commissionGross : 40;

  const patientsTarget =
    subscriptionAmount > 0 && feePerPatient > 0
      ? Math.ceil(subscriptionAmount / feePerPatient)
      : 0;

  const patientsStillNeeded =
    subscriptionAmount > commissionGross && feePerPatient > 0
      ? Math.ceil((subscriptionAmount - commissionGross) / feePerPatient)
      : 0;

  const isFreeThisMonth =
    subscriptionAmount > 0 &&
    (commissionGross >= subscriptionAmount || offsetAmount >= subscriptionAmount);

  const progressPercent =
    subscriptionAmount > 0
      ? Math.min(100, roundMoney((commissionGross / subscriptionAmount) * 100))
      : attended > 0
        ? 100
        : 0;

  return {
    periodKey,
    currency,
    patientsAttended: attended,
    patientsTarget,
    patientsStillNeeded,
    feePerPatient,
    subscriptionAmount,
    commissionGross,
    offsetAmount,
    progressPercent,
    isFreeThisMonth,
    settlementSummary: summary,
  };
}

export const KIOREX_PROGRESS_NUDGE_THRESHOLDS = [50, 80, 100] as const;