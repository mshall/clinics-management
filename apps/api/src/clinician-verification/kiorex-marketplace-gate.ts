import { VerificationStatus } from "@prisma/client";

/** KX-01: Kiorex marketplace listing requires at least one verified clinician (PRVER: verified for their profession). */
export const KIOREX_VERIFICATION_REQUIRED = "CLINICIAN_VERIFICATION_REQUIRED";

const LISTABLE_PROFESSIONS = ["PHYSICIAN", "DENTIST", "PHYSIOTHERAPIST", "NURSE"];

export function tenantHasVerifiedPhysician(
  rows: {
    status: VerificationStatus;
    user: { role: string; additionalRoles: string[]; profession?: string | null };
    /** Profession the record was verified for; NULL = verified before PRSOP01 (legacy physician). */
    verifiedProfession?: string | null;
  }[],
): boolean {
  return rows.some((row) => {
    if (row.status !== VerificationStatus.VERIFIED) return false;
    const roles = [row.user.role, ...row.user.additionalRoles];
    const current = row.user.profession ?? (roles.includes("PHYSICIAN") ? "PHYSICIAN" : roles.includes("NURSE") ? "NURSE" : null);
    if (!current || !LISTABLE_PROFESSIONS.includes(current)) return false; // unlicensed assistants never count
    if (row.verifiedProfession && row.verifiedProfession !== current) return false; // verified for another profession
    return true;
  });
}
