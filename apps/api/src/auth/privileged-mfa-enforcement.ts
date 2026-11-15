/** Privileged-role MFA is enforced only on AWS production (App Runner), not local dev. */
export function isAwsProductionDeploy(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  return Boolean(
    isProduction &&
      (process.env.KIORLY_DEPLOY_TARGET?.trim() === "aws" ||
        process.env.AWS_EXECUTION_ENV?.trim() ||
        (process.env.AWS_REGION?.trim() && process.env.KIORLY_DEPLOY_TARGET !== "local")),
  );
}

/** True when an operator attempted to disable MFA in production (audit + still enforce on AWS). */
export function privilegedMfaDisableAttemptInProduction(): boolean {
  return isAwsProductionDeploy() && process.env.PRIVILEGED_MFA_ENFORCE === "false";
}

export function privilegedMfaEnforced(): boolean {
  if (privilegedMfaDisableAttemptInProduction()) return true;
  if (process.env.PRIVILEGED_MFA_ENFORCE === "false") return false;
  if (process.env.PRIVILEGED_MFA_ENFORCE === "true") return true;
  return isAwsProductionDeploy();
}