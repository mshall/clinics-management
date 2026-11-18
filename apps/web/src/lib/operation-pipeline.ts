import { normalizeOperationStatus } from "@/lib/operation-status-policy";

/** Matches API `PIPELINE` in operation-status-flow.ts (after normalize). */
export const OPERATION_PIPELINE = ["BOOKED", "PRE_OP", "IN_PROGRESS", "RECOVERY", "DISCHARGED"] as const;

export function pipelineIndex(status: string): number {
  return OPERATION_PIPELINE.indexOf(normalizeOperationStatus(status) as (typeof OPERATION_PIPELINE)[number]);
}

/** True when target discharge/completed is more than one step ahead (requires API allowPipelineSkip). */
export function operationNeedsPipelineSkip(fromStatus: string, targetStatus: string): boolean {
  const from = pipelineIndex(fromStatus);
  const to = pipelineIndex(targetStatus === "COMPLETED" ? "DISCHARGED" : targetStatus);
  if (from < 0 || to < 0) return false;
  return to > from + 1;
}

export function skippedPipelineStageKeys(fromStatus: string, targetStatus: string): string[] {
  const from = pipelineIndex(fromStatus);
  const to = pipelineIndex(targetStatus === "COMPLETED" ? "DISCHARGED" : targetStatus);
  if (from < 0 || to < 0 || to <= from + 1) return [];
  return OPERATION_PIPELINE.slice(from + 1, to).map(String);
}