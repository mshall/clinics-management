import { PLAN_UPGRADE_REQUIRED } from "./plan-upgrade-constants";

export type PlanUpgradePayload = {
  code: typeof PLAN_UPGRADE_REQUIRED;
  entitlement: string;
  requiredPlan: string;
};

export function parsePlanUpgradePayload(body: unknown): PlanUpgradePayload | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (row.code !== PLAN_UPGRADE_REQUIRED) return null;
  const entitlement = typeof row.entitlement === "string" ? row.entitlement : "";
  const requiredPlan = typeof row.requiredPlan === "string" ? row.requiredPlan : "";
  if (!entitlement) return null;
  return { code: PLAN_UPGRADE_REQUIRED, entitlement, requiredPlan: requiredPlan || "PRO" };
}