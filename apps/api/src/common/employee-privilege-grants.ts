import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";
import {
  roleCanArchiveEmployees,
  roleCanManageEmployees,
  roleUsesHrProvisionerFlow,
} from "./employee-manage-roles";

const CLINIC_SCOPE_ROLES: ReadonlySet<UserRole> = new Set([UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

export type ResolvedEmployeePrivilegeGrant = {
  id: string;
  clinicId: string;
  clinicNameEn: string;
  templateEmployeeId: string;
  templateEmployeeName: string;
  templateUserRole: UserRole;
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

export function capabilitiesFromTemplateRole(role: UserRole): Omit<
  EmployeePrivilegeGrantSummary,
  "clinicId"
> {
  return {
    canManageEmployees: roleCanManageEmployees(role),
    canArchiveEmployees: roleCanArchiveEmployees(role),
    hrProvisionLogin: roleUsesHrProvisionerFlow(role),
  };
}

export function toGrantSummary(grant: ResolvedEmployeePrivilegeGrant): EmployeePrivilegeGrantSummary {
  return {
    clinicId: grant.clinicId,
    canManageEmployees: grant.canManageEmployees,
    canArchiveEmployees: grant.canArchiveEmployees,
    hrProvisionLogin: grant.hrProvisionLogin,
  };
}

export async function loadResolvedEmployeePrivilegeGrants(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<ResolvedEmployeePrivilegeGrant[]> {
  const rows = await prisma.userClinicEmployeePrivilegeGrant.findMany({
    where: { tenantId, userId },
    include: {
      clinic: { select: { nameEn: true } },
      templateEmployee: {
        select: {
          id: true,
          firstNameEn: true,
          lastNameEn: true,
          user: { select: { role: true } },
        },
      },
    },
    orderBy: { clinic: { nameEn: "asc" } },
  });

  const out: ResolvedEmployeePrivilegeGrant[] = [];
  for (const row of rows) {
    const templateRole = row.templateEmployee.user?.role;
    if (!templateRole) continue;
    const caps = capabilitiesFromTemplateRole(templateRole);
    out.push({
      id: row.id,
      clinicId: row.clinicId,
      clinicNameEn: row.clinic.nameEn,
      templateEmployeeId: row.templateEmployeeId,
      templateEmployeeName: `${row.templateEmployee.firstNameEn} ${row.templateEmployee.lastNameEn}`.trim(),
      templateUserRole: templateRole,
      ...caps,
    });
  }
  return out;
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
