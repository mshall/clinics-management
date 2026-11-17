import type { RxSafetySeverity } from "./rx-safety.types";

export function normalizeRxSeverity(raw: string | null | undefined): RxSafetySeverity {
  const s = raw?.trim().toLowerCase() ?? "moderate";
  if (s === "contraindicated") return "contraindicated";
  if (s === "major" || s === "high") return "major";
  if (s === "moderate") return "moderate";
  if (s === "minor" || s === "low") return "minor";
  if (s === "info") return "info";
  return "moderate";
}

export function severityRequiresOverride(severity: RxSafetySeverity): boolean {
  return severity === "major" || severity === "contraindicated";
}