import { AppointmentStatus } from "@prisma/client";

/**
 * FS-05 no-show risk. A fixed scoring rule over the patient's record and booking timing — not a trained model.
 * `method` stays RULE_BASED until a trained model ships; the UI labels the estimate from this field.
 */
export const NO_SHOW_RISK_METHOD = "RULE_BASED" as const;
export type NoShowRiskMethod = typeof NO_SHOW_RISK_METHOD;

export type NoShowRiskBand = "LOW" | "MEDIUM" | "HIGH";
export type NoShowRiskFactor = "PRIOR_NO_SHOWS" | "DEPOSIT_FLAG" | "SHORT_NOTICE";
export type NoShowRiskSuggestion = "DEPOSIT" | "EXTRA_REMINDER";

export type NoShowRiskInput = { noShowCount: number; requiresDeposit: boolean; hoursUntilStart: number };

export type NoShowRiskView = {
  score: number;
  band: NoShowRiskBand;
  method: NoShowRiskMethod;
  factors: NoShowRiskFactor[];
  priorNoShows: number;
  suggestion: NoShowRiskSuggestion | null;
};

export const NO_SHOW_RISK_MEDIUM_AT = 30;
export const NO_SHOW_RISK_HIGH_AT = 60;
const SHORT_NOTICE_HOURS = 4;

export function computeNoShowRisk(input: NoShowRiskInput): { score: number; factors: NoShowRiskFactor[] } {
  const factors: NoShowRiskFactor[] = [];
  let score = Math.min(85, Math.max(0, input.noShowCount) * 18);
  if (input.noShowCount > 0) factors.push("PRIOR_NO_SHOWS");
  if (input.requiresDeposit) {
    score += 12;
    factors.push("DEPOSIT_FLAG");
  }
  if (input.hoursUntilStart < SHORT_NOTICE_HOURS) {
    score += 8;
    factors.push("SHORT_NOTICE");
  }
  return { score: Math.min(99, Math.max(5, score)), factors };
}

export function noShowRiskBand(score: number): NoShowRiskBand {
  if (score >= NO_SHOW_RISK_HIGH_AT) return "HIGH";
  if (score >= NO_SHOW_RISK_MEDIUM_AT) return "MEDIUM";
  return "LOW";
}

/** High risk only: ask for a deposit when the plan supports it and none is required yet, otherwise send an extra reminder. */
export function noShowRiskSuggestion(
  band: NoShowRiskBand,
  ctx: { requiresDeposit: boolean; depositsAvailable: boolean },
): NoShowRiskSuggestion | null {
  if (band !== "HIGH") return null;
  return ctx.depositsAvailable && !ctx.requiresDeposit ? "DEPOSIT" : "EXTRA_REMINDER";
}

const SCORED_STATUSES: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];

export function noShowRiskForAppointment(
  apt: { status: AppointmentStatus; startsAt: Date },
  patient: { noShowCount: number; requiresAppointmentDeposit: boolean },
  ctx: { now: Date; depositsAvailable: boolean },
): NoShowRiskView | null {
  if (!SCORED_STATUSES.includes(apt.status) || apt.startsAt.getTime() <= ctx.now.getTime()) return null;
  const { score, factors } = computeNoShowRisk({
    noShowCount: patient.noShowCount,
    requiresDeposit: patient.requiresAppointmentDeposit,
    hoursUntilStart: (apt.startsAt.getTime() - ctx.now.getTime()) / 3_600_000,
  });
  const band = noShowRiskBand(score);
  return {
    score,
    band,
    method: NO_SHOW_RISK_METHOD,
    factors,
    priorNoShows: patient.noShowCount,
    suggestion: noShowRiskSuggestion(band, {
      requiresDeposit: patient.requiresAppointmentDeposit,
      depositsAvailable: ctx.depositsAvailable,
    }),
  };
}
