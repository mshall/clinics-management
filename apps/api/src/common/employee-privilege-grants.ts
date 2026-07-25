import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import {
  roleCanArchiveEmployees,
  roleCanManageEmployees,
  roleUsesHrProvisionerFlow,
} from "./employee-manage-roles";

const CLINIC_SCOPE_ROLES: ReadonlySet<UserRole> = new Set([UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

/** Full clinic HR officer capabilities for a delegated assignment. */
const CLINIC_HR_CAPABILITIES = {
  canManageEmployees: true,
  canArchiveEmployees: true,
  hrProvisionLogin: true,
} as const;

export type ResolvedClinicHrAssignment = {
  id: string;
  clinicId: string;
  clinicNameEn: string;
  canManageEmployees: boolean;
  canArchiveEmployees: boolean;
  hrProvisionLogin: boolean;
};

export type EmployeePrivilegeGrantSummary = {
  clinicId: string;
  canManageEmployees: boolean;
  canArchiveEmployees: boolean;
  hrProvisionLogin: boolean;
};

export function toGrantSummary(assignment: ResolvedClinicHrAssignment): EmployeePrivilegeGrantSummary {
  return {
    clinicId: assignment.clinicId,
    canManageEmployees: assignment.canManageEmployees,
    canArchiveEmployees: assignment.canArchiveEmployees,
    hrProvisionLogin: assignment.hrProvisionLogin,
  };
}

export async function loadResolvedEmployeePrivilegeGrants(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<ResolvedClinicHrAssignment[]> {
  const rows = await prisma.userClinicEmployeePrivilegeGrant.findMany({
    where: { tenantId, userId },
    include: {
      clinic: { select: { nameEn: true } },
    },
    orderBy: { clinic: { nameEn: "asc" } },
  });

  return rows.map((row) => ({
    id: row.id,
    clinicId: row.clinicId,
    clinicNameEn: row.clinic.nameEn,
    ...CLINIC_HR_CAPABILITIES,
  }));
}

export async function loadEmployeePrivilegeGrantSummaries(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<EmployeePrivilegeGrantSummary[]> {
  const grants = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, userId);
  return grants.map(toGrantSummary);
}

export async function viewerCanManageEmployees(
  prisma: PrismaService,
  tenantId: string,
  viewer: JwtUser,
): Promise<boolean> {
  if (roleCanManageEmployees(viewer.role)) return true;
  const grants = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, viewer.userId);
  return grants.some((g) => g.canManageEmployees);
}

export async function viewerCanArchiveEmployees(
  prisma: PrismaService,
  tenantId: string,
  viewer: JwtUser,
): Promise<boolean> {
  if (roleCanArchiveEmployees(viewer.role)) return true;
  const grants = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, viewer.userId);
  return grants.some((g) => g.canArchiveEmployees);
}

export async function viewerUsesHrProvisionerFlow(
  prisma: PrismaService,
  tenantId: string,
  viewer: JwtUser,
): Promise<boolean> {
  if (roleUsesHrProvisionerFlow(viewer.role)) return true;
  const grants = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, viewer.userId);
  return grants.some((g) => g.hrProvisionLogin);
}

export async function viewerHasEmployeeManageAccessAtClinic(
  prisma: PrismaService,
  tenantId: string,
  viewer: JwtUser,
  clinicId: string,
): Promise<boolean> {
  if (viewer.role === UserRole.GROUP_ADMIN) return true;
  if (CLINIC_SCOPE_ROLES.has(viewer.role)) {
    const scope = await prisma.clinicAdminScope.findFirst({
      where: { tenantId, userId: viewer.userId, clinicId },
    });
    return Boolean(scope);
  }
  if (viewer.role === UserRole.HR_OFFICER) {
    const link = await prisma.employee.findFirst({
      where: { tenantId, userId: viewer.userId, deletedAt: null },
      select: { clinicId: true },
    });
    return link?.clinicId === clinicId;
  }
  const grants = await loadResolvedEmployeePrivilegeGrants(prisma, tenantId, viewer.userId);
  if (grants.some((g) => g.clinicId === clinicId && g.canManageEmployees)) return true;
  return roleCanManageEmployees(viewer.role);
}
