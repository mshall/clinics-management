/** SC-04 — privileged MFA in every production-like environment (not only AWS App Runner). */

export const PRIVILEGED_MFA_GRACE_DAYS = 7;

/** Staging / production deploy (or AWS) — never local/dev/test. */
export function isProductionLikeDeploy(): boolean {
  const env = (process.env.KIORLY_ENV ?? process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (env === "test" || env === "development" || env === "dev") return false;
  if (process.env.KIORLY_DEPLOY_TARGET?.trim() === "local") return false;

  if (env === "staging" || env === "production" || env === "prod") return true;

  const nodeProd = process.env.NODE_ENV === "production";
  if (!nodeProd) return false;

  return Boolean(
    process.env.KIORLY_DEPLOY_TARGET?.trim() === "aws" ||
      process.env.AWS_EXECUTION_ENV?.trim() ||
      process.env.AWS_REGION?.trim(),
  );
}

/** @deprecated use isProductionLikeDeploy — kept for call sites / audits. */
export function isAwsProductionDeploy(): boolean {
  return isProductionLikeDeploy();
}

/** True when an operator attempted to disable MFA in production-like (audit + still enforce). */
export function privilegedMfaDisableAttemptInProduction(): boolean {
  return isProductionLikeDeploy() && process.env.PRIVILEGED_MFA_ENFORCE === "false";
}

export function privilegedMfaEnforced(): boolean {
  if (privilegedMfaDisableAttemptInProduction()) return true;
  if (process.env.PRIVILEGED_MFA_ENFORCE === "false") return false;
  if (process.env.PRIVILEGED_MFA_ENFORCE === "true") return true;
  return isProductionLikeDeploy();
}

/** Grace window from account creation before MFA is mandatory. */
export function mfaGraceExpired(createdAt: Date, now = new Date(), graceDays = PRIVILEGED_MFA_GRACE_DAYS): boolean {
  const ends = createdAt.getTime() + graceDays * 86_400_000;
  return now.getTime() >= ends;
}

/** Billing / money routes that owners must not hit without MFA after the grace period. */
export function isBillingMfaPath(path: string): boolean {
  const p = path.split("?")[0] ?? "";
  return (
    p.startsWith("/api/v1/billing") ||
    p.startsWith("/api/v1/kiorly") ||
    p.includes("/billing/") ||
    p.startsWith("/api/v1/subscriptions") ||
    p.startsWith("/api/v1/plans") ||
    p.startsWith("/api/v1/revenue") ||
    p.startsWith("/api/v1/expenses")
  );
}
