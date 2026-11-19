import { createHash, randomBytes } from "node:crypto";
import { DEPOSIT_POLICY_DEFAULTS, type DepositPolicy, depositPolicySchema } from "../markets/commercial-config.schema";
import { roundMoney } from "./patient-money";

export type DepositReason = "PATIENT_FLAG" | "NO_SHOWS" | "RISK_SCORE" | "APPOINTMENT_TYPE" | "MANUAL";

/** Market pack `commercialConfig.deposits`, overlaid with the clinic's partial `Clinic.depositPolicy`. */
export function resolveDepositPolicy(marketCommercialConfig: unknown, clinicOverride: unknown): DepositPolicy {
  const market = depositPolicySchema
    .partial()
    .safeParse((marketCommercialConfig as { deposits?: unknown } | null)?.deposits ?? {});
  const clinic = depositPolicySchema.partial().safeParse(clinicOverride ?? {});
  return {
    ...DEPOSIT_POLICY_DEFAULTS,
    ...(market.success ? market.data : {}),
    ...(clinic.success ? clinic.data : {}),
  };
}

export type DepositRequirementInput = {
  patientFlag: boolean;
  noShowCount: number;
  riskScore: number | null;
  typeDepositAmount: number | null;
  feeAmount: number;
};

export type DepositRequirement = { required: boolean; reasons: DepositReason[]; amount: number };

/**
 * A booking needs a deposit when the patient is flagged, has ≥ N no-shows, the risk score is ≥ X, or the
 * appointment type carries a deposit. Amount: the type's deposit, else a percent of the fee — never above the fee.
 */
export function depositRequirement(input: DepositRequirementInput, policy: DepositPolicy): DepositRequirement {
  const reasons: DepositReason[] = [];
  if (input.patientFlag) reasons.push("PATIENT_FLAG");
  if (input.noShowCount >= policy.noShowThreshold) reasons.push("NO_SHOWS");
  if (input.riskScore != null && input.riskScore >= policy.riskScoreThreshold) reasons.push("RISK_SCORE");
  const typeAmount = input.typeDepositAmount != null && input.typeDepositAmount > 0 ? input.typeDepositAmount : null;
  if (typeAmount != null) reasons.push("APPOINTMENT_TYPE");
  const fee = Math.max(0, input.feeAmount);
  const raw = typeAmount ?? (fee * policy.defaultPercentOfFee) / 100;
  const amount = roundMoney(fee > 0 ? Math.min(raw, fee) : raw);
  return { required: reasons.length > 0 && amount > 0, reasons, amount };
}

/** Link lifetime: policy hours, but never past the appointment start. */
export function depositLinkExpiry(now: Date, startsAt: Date, policy: DepositPolicy): Date {
  return new Date(Math.min(now.getTime() + policy.linkExpiryHours * 3_600_000, startsAt.getTime()));
}

export function newDepositLinkToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashDepositLinkToken(token) };
}

export function hashDepositLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
