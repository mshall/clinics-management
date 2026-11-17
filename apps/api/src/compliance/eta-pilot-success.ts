import type { FiscalSubmissionStatus } from "@prisma/client";

/** Egypt pilot week-1 gate (markets/egypt.md). */
export const ETA_PILOT_SUCCESS_THRESHOLD = 0.95;

export type EtaSubmissionMetricRow = {
  id: string;
  clinicId: string;
  submittedAt: Date | null;
  status: FiscalSubmissionStatus;
  providerValidationStatus: string;
  idempotencyKey: string | null;
};

export function isManualFiscalIntervention(idempotencyKey: string | null | undefined): boolean {
  if (!idempotencyKey) return false;
  return idempotencyKey.includes(":resubmit:") || idempotencyKey.includes(":manual:");
}

export function isSubmittedForPilotMetric(row: EtaSubmissionMetricRow): boolean {
  if (!row.submittedAt) return false;
  if (isManualFiscalIntervention(row.idempotencyKey)) return false;
  return row.status !== "CANCELLED";
}

export type EtaPilotSuccessSummary = {
  submittedCount: number;
  validCount: number;
  invalidCount: number;
  pendingValidationCount: number;
  manualInterventionCount: number;
  successRate: number | null;
  meetsPilotCriterion: boolean;
};

export function computeEtaPilotSuccess(rows: EtaSubmissionMetricRow[]): EtaPilotSuccessSummary {
  const submitted = rows.filter(isSubmittedForPilotMetric);
  const manualInterventionCount = rows.filter((r) => isManualFiscalIntervention(r.idempotencyKey)).length;
  let validCount = 0;
  let invalidCount = 0;
  let pendingValidationCount = 0;
  for (const r of submitted) {
    if (r.providerValidationStatus === "VALID") validCount++;
    else if (r.providerValidationStatus === "INVALID") invalidCount++;
    else pendingValidationCount++;
  }
  const submittedCount = submitted.length;
  const successRate = submittedCount > 0 ? validCount / submittedCount : null;
  const meetsPilotCriterion =
    submittedCount > 0 && successRate !== null && successRate >= ETA_PILOT_SUCCESS_THRESHOLD;
  return {
    submittedCount,
    validCount,
    invalidCount,
    pendingValidationCount,
    manualInterventionCount,
    successRate,
    meetsPilotCriterion,
  };
}

export function pilotWeekOneWindow(pilotStartedAt: Date, now = new Date()): { from: Date; to: Date } | null {
  const from = pilotStartedAt;
  const to = new Date(from.getTime() + 7 * 86_400_000);
  if (now < from) return null;
  return { from, to: now < to ? now : to };
}