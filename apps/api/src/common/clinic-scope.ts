import { ClinicRecordStatus, Prisma, UserRole } from "@prisma/client";
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

/**
 * All clinics under the same parent HQ as any clinic where this user has an {@link Employee} record.
 * If the user has no HR link, they may see every clinic in the tenant (same organization).
 */
export async function fetchPhysicianNetworkClinicIds(prisma: PrismaService, tenantId: string, userId: string): Promise<string[]> {
  const links = await prisma.employee.findMany({
    where: { tenantId, userId },
    select: { clinicId: true },
  });
  if (links.length === 0) {
    const all = await prisma.clinic.findMany({
      where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE },
      select: { id: true },
    });
    return all.map((c) => c.id);
  }
  const roots = new Set<string>();
  for (const { clinicId } of links) {
    let walkId: string | null = clinicId;
    for (let guard = 0; guard < 32 && walkId; guard += 1) {
      let cur: { id: string; parentClinicId: string | null } | null;
      cur = await prisma.clinic.findFirst({
        where: { id: walkId, tenantId },
        select: { id: true, parentClinicId: true },
      });
      if (!cur) break;
      if (!cur.parentClinicId) {
        roots.add(cur.id);
        break;
      }
      walkId = cur.parentClinicId;
    }
  }
  if (roots.size === 0) return [];
  const ors: Prisma.ClinicWhereInput[] = [];
  for (const hq of roots) {
    ors.push({ id: hq });
    ors.push({ parentClinicId: hq });
  }
  const clinics = await prisma.clinic.findMany({
    where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE, OR: ors },
    select: { id: true },
  });
  return [...new Set(clinics.map((c) => c.id))];
}

/**
 * Clinic IDs used to filter patient registry / demographics for the current user.
 * `null` means no clinic-based restriction (full tenant).
 */
export async function fetchPatientListClinicScopeIds(
  prisma: PrismaService,
  tenantId: string,
  user: JwtUser
): Promise<string[] | null> {
  if (user.role === UserRole.PHYSICIAN) {
    return await fetchPhysicianNetworkClinicIds(prisma, tenantId, user.userId);
  }
  return await fetchClinicScopeIds(prisma, tenantId, user);
}
