import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * ClinicAdminScope rows gate visibility for both CLINIC_ADMIN and BRANCH_MANAGER (same join table).
 * Returns null when the caller is not limited by clinic assignment.
 */
export const CLINIC_SCOPE_ROLES: ReadonlySet<UserRole> = new Set([UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

export async function fetchClinicScopeIds(prisma: PrismaService, tenantId: string, user: JwtUser): Promise<string[] | null> {
  if (!CLINIC_SCOPE_ROLES.has(user.role)) return null;
  const scopes = await prisma.clinicAdminScope.findMany({
    where: { tenantId, userId: user.userId },
    select: { clinicId: true },
  });
  return scopes.map((s) => s.clinicId);
}
