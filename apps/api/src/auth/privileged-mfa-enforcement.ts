/** Privileged-role MFA is enforced only on AWS production (App Runner), not local dev. */
export function privilegedMfaEnforced(): boolean {
  if (process.env.PRIVILEGED_MFA_ENFORCE === "false") return false;
  if (process.env.PRIVILEGED_MFA_ENFORCE === "true") return true;

  const isProduction = process.env.NODE_ENV === "production";
  const onAws = Boolean(
    process.env.KIORLY_DEPLOY_TARGET?.trim() === "aws" ||
      process.env.AWS_EXECUTION_ENV?.trim() ||
      (process.env.AWS_REGION?.trim() && process.env.KIORLY_DEPLOY_TARGET !== "local"),
  );
  return isProduction && onAws;
}