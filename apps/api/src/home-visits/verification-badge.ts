import { Profession, UserRole } from "@prisma/client";
import { resolveProfessionPack, type ProfessionPack } from "../scope-of-practice/profession-pack";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { verificationBadge } from "../clinician-verification/profession-verification";

export { resolveProfessionPack };

/** Badge text for the HOME_VISIT_ASSIGNED event ("Verified nurse"): names the profession, English label for Kiorex. */
export function verificationBadgeFor(u: { profession: Profession | null; role: UserRole; additionalRoles: UserRole[]; tenant?: { market?: { code: string; clinicalConfig: unknown } | null } | null }, status?: import("@prisma/client").VerificationStatus | null) {
  const pack: ProfessionPack = resolveProfessionPack(u.tenant?.market as never);
  return verificationBadge(pack, effectiveProfession(u), status ?? "VERIFIED");
}
