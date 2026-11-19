/** CR-10 — pure no-show guarantee math (reproducible from appointment outcomes). */

import type { NoShowGuaranteeConfig } from "../markets/commercial-config.schema";

export type GuaranteeAppointmentRow = {
  status: string;
  startsAt: Date;
};

export type GuaranteeWindowStats = {
  from: Date;
  to: Date;
  appointments: number;
  noShows: number;
  rate: number;
};

export const NO_SHOW_GUARANTEE_SOURCE_REF = (tenantId: string) => `no-show-guarantee:${tenantId}`;

const MS_DAY = 86_400_000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_DAY);
}

export function daysSince(activatedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - activatedAt.getTime()) / MS_DAY);
}

/** Denominator = COMPLETED + NO_SHOW (same as RP-01 outcomes). */
export function outcomeStats(rows: GuaranteeAppointmentRow[]): { appointments: number; noShows: number; rate: number } {
  const outcomes = rows.filter((r) => r.status === "COMPLETED" || r.status === "NO_SHOW");
  const noShows = outcomes.filter((r) => r.status === "NO_SHOW").length;
  const appointments = outcomes.length;
  const rate = appointments === 0 ? 0 : Math.round((noShows / appointments) * 1000) / 10;
  return { appointments, noShows, rate };
}

export function windowStats(
  rows: GuaranteeAppointmentRow[],
  from: Date,
  to: Date,
): GuaranteeWindowStats {
  const inWindow = rows.filter((r) => r.startsAt >= from && r.startsAt < to);
  return { from, to, ...outcomeStats(inWindow) };
}

/**
 * Reduction % = (baselineRate − evaluationRate) / baselineRate × 100.
 * When baselineRate is 0, reduction is 0 (cannot improve further).
 */
export function reductionPercent(baselineRate: number, evaluationRate: number): number {
  if (baselineRate <= 0) return 0;
  return Math.round(((baselineRate - evaluationRate) / baselineRate) * 1000) / 10;
}

export type GuaranteeCalculation = {
  baseline: GuaranteeWindowStats;
  evaluation: GuaranteeWindowStats;
  reductionPercent: number;
  targetReductionPercent: number;
  met: boolean;
  baselineEligible: boolean;
  evaluationComplete: boolean;
};

export function calculateNoShowGuarantee(
  rows: GuaranteeAppointmentRow[],
  activatedAt: Date,
  now: Date,
  config: NoShowGuaranteeConfig,
): GuaranteeCalculation {
  const baselineFrom = activatedAt;
  const baselineTo = addDays(activatedAt, config.baselineDays);
  const evalFrom = baselineTo;
  const evalTo = addDays(activatedAt, config.evaluationDay);
  const baseline = windowStats(rows, baselineFrom, baselineTo);
  const evaluation = windowStats(rows, evalFrom, evalTo);
  const reduction = reductionPercent(baseline.rate, evaluation.rate);
  const baselineEligible = baseline.appointments >= config.minBaselineAppointments;
  const evaluationComplete = now.getTime() >= evalTo.getTime();
  const met =
    baselineEligible && evaluationComplete && reduction >= config.targetReductionPercent;
  return {
    baseline,
    evaluation,
    reductionPercent: reduction,
    targetReductionPercent: config.targetReductionPercent,
    met,
    baselineEligible,
    evaluationComplete,
  };
}
