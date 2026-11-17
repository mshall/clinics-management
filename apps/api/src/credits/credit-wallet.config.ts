import { Prisma } from "@prisma/client";

/** Default dual-approval threshold when market pack omits `credits.dualApprovalThreshold`. */
export const DEFAULT_CREDIT_GRANT_DUAL_APPROVAL_THRESHOLD = new Prisma.Decimal(5000);

export function dualApprovalThresholdFromMarket(featureDefaults: unknown): Prisma.Decimal {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return DEFAULT_CREDIT_GRANT_DUAL_APPROVAL_THRESHOLD;
  }
  const credits = (featureDefaults as Record<string, unknown>).credits;
  if (!credits || typeof credits !== "object" || Array.isArray(credits)) {
    return DEFAULT_CREDIT_GRANT_DUAL_APPROVAL_THRESHOLD;
  }
  const raw = (credits as Record<string, unknown>).dualApprovalThreshold;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Prisma.Decimal(String(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    return new Prisma.Decimal(raw.trim());
  }
  return DEFAULT_CREDIT_GRANT_DUAL_APPROVAL_THRESHOLD;
}