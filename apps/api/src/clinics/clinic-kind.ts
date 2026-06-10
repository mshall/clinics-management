export type ClinicKind = "parent" | "branch" | "standalone";

/** Derive display kind: branch if nested; parent only when it has branches; otherwise standalone (flat sibling). */
export function resolveClinicKind(
  parentClinicId: string | null | undefined,
  branchCount: number,
): ClinicKind {
  if (parentClinicId) return "branch";
  if (branchCount > 0) return "parent";
  return "standalone";
}
