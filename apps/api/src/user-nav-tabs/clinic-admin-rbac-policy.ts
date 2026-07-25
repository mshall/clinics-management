import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import type { PrismaService } from "../prisma/prisma.service";

/** Organization-wide roles — clinic admins must not change their sidebar grants. */
export const CLINIC_ADMIN_FORBIDDEN_RBAC_TARGET_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.HR_OFFICER,
  UserRole.FINANCE_OFFICER,
  UserRole.CALL_CENTER,
]);

export async function resolveUserClinicIds(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const row = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      clinicAdminScopes: { select: { clinicId: true } },
      employee: { select: { clinicId: true } },
    },
  });
  if (!row) return [];
  const ids = new Set<string>();
  for (const s of row.clinicAdminScopes) ids.add(s.clinicId);
  if (row.employee?.clinicId) ids.add(row.employee.clinicId);
  return [...ids];
}

export async function assertClinicAdminCanManageUserNavTabs(
  prisma: PrismaService,
  tenantId: string,
  actor: JwtUser,
  target: { id: string; role: UserRole },
): Promise<void> {
  if (actor.role !== UserRole.CLINIC_ADMIN) return;

  if (CLINIC_ADMIN_FORBIDDEN_RBAC_TARGET_ROLES.has(target.role)) {
    throw new ForbiddenException("Clinic administrators cannot change permissions for organization-wide roles");
  }

  const scopeIds = await fetchClinicScopeIds(prisma, tenantId, actor);
  if (scopeIds == null || !scopeIds.length) {
    throw new ForbiddenException("No clinic assignment for this administrator");
  }

  const targetClinicIds = await resolveUserClinicIds(prisma, tenantId, target.id);
  if (!targetClinicIds.some((id) => scopeIds.includes(id))) {
    throw new ForbiddenException("This user is outside your assigned clinics");
  }
}

export async function loadNavTabTargetUser(
  prisma: PrismaService,
  tenantId: string,
  targetUserId: string,
): Promise<{ id: string; role: UserRole; tenantId: string | null }> {
  const target = await prisma.user.findFirst({ where: { id: targetUserId, tenantId } });
  if (!target) throw new NotFoundException("User not found");
  return target;
}
