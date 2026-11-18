import { VerificationStatus } from "@prisma/client";

/** KX-01: Kiorex marketplace listing requires at least one verified physician. */
export const KIOREX_VERIFICATION_REQUIRED = "CLINICIAN_VERIFICATION_REQUIRED";

export function tenantHasVerifiedPhysician(
  rows: { status: VerificationStatus; user: { role: string; additionalRoles: string[] } }[],
): boolean {
  return rows.some((row) => {
    if (row.status !== VerificationStatus.VERIFIED) return false;
    const roles = [row.user.role, ...row.user.additionalRoles];
    return roles.includes("PHYSICIAN");
  });
}