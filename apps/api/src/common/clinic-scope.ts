import { ClinicRecordStatus, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { loadResolvedEmployeePrivilegeGrants } from "./employee-privilege-grants";
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

/** Clinics an HR manager may act on: their linked employee primary clinic only. */
export async function fetchHrOfficerClinicScopeIds(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const link = await prisma.employee.findFirst({
    where: { tenantId, userId, deletedAt: null },
    select: { clinicId: true },
  });
  return link ? [link.clinicId] : [];
}

/**
 * Employee HR actions scope: clinic admins/managers via scope table; HR via linked clinic; null = whole tenant.
 */
export async function fetchEmployeeManageScopeIds(
  prisma: PrismaService,
  tenantId: string,
  user: JwtUser,
): Promise<string[] | null> {
  if (CLINIC_SCOPE_ROLES.has(user.role)) return fetchClinicScopeIds(prisma, tenantId, user);
  if (user.role === UserRole.HR_OFFICER) return fetchHrOfficerClinicScopeIds(prisma, tenantId, user.userId);
  if (user.role === UserRole.GROUP_ADMIN) return null;
  const delegated = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, user.userId);
  const clinicIds = delegated.filter((g) => g.canManageEmployees).map((g) => g.clinicId);
  return clinicIds.length ? [...new Set(clinicIds)] : null;
}

/** HQ clinic plus its branches — used for group physician assignment from a clinic HR desk. */
export async function fetchClinicGroupNetworkIds(
  prisma: PrismaService,
  tenantId: string,
  clinicId: string,
): Promise<string[]> {
  let walkId: string | null = clinicId;
  let hqId: string | null = null;
  for (let guard = 0; guard < 32 && walkId; guard += 1) {
    const cur: { id: string; parentClinicId: string | null } | null = await prisma.clinic.findFirst({
      where: { id: walkId, tenantId },
      select: { id: true, parentClinicId: true },
    });
    if (!cur) break;
    if (!cur.parentClinicId) {
      hqId = cur.id;
      break;
    }
    walkId = cur.parentClinicId;
  }
  if (!hqId) return [clinicId];
  const clinics = await prisma.clinic.findMany({
    where: {
      tenantId,
      recordStatus: ClinicRecordStatus.ACTIVE,
      OR: [{ id: hqId }, { parentClinicId: hqId }],
    },
    select: { id: true },
  });
  return [...new Set(clinics.map((c) => c.id))];
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
