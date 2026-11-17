import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { loadResolvedEmployeePrivilegeGrants } from "../common/employee-privilege-grants";
import { PrismaService } from "../prisma/prisma.service";
import { UserClinicPrivilegeGrantsService } from "../user-clinic-privilege-grants/user-clinic-privilege-grants.service";
import { isFullRoleNav, sanitizeUserNavTabGrant } from "./nav-tab-keys";
import { parseTabAccessModes, sanitizeTabAccessModes } from "./nav-tab-access-modes";
import {
  assertClinicAdminCanManageUserNavTabs,
  loadNavTabTargetUser,
} from "./clinic-admin-rbac-policy";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";

@Injectable()
export class UserNavTabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
    private readonly hrAssignments: UserClinicPrivilegeGrantsService,
  ) {}

  private assertCanManage(actor: JwtUser, target: { id: string; role: UserRole; tenantId: string | null }): void {
    if (actor.tenantId == null || target.tenantId !== actor.tenantId) throw new ForbiddenException();
    if (hasRole(actor, UserRole.GROUP_ADMIN)) return;
    if (hasRole(actor, UserRole.CLINIC_ADMIN)) {
      if (hasAnyRole(target, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN])) {
        throw new ForbiddenException("Clinic administrators cannot change navigation for this role");
      }
      return;
    }
    throw new ForbiddenException("Only group or clinic administrators may manage tab visibility");
  }

  private async assertCanManageAsync(actor: JwtUser, tenantId: string, targetUserId: string): Promise<void> {
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    this.assertCanManage(actor, target);
    await assertClinicAdminCanManageUserNavTabs(this.prisma, tenantId, actor, target);
  }

  async getForUser(
    tenantId: string,
    targetUserId: string,
    actor: JwtUser,
  ): Promise<{
    tabKeys: string[] | null;
    tabAccessModes: Record<string, "read" | "write"> | null;
    roleTabKeys: string[];
  }> {
    await this.assertCanManageAsync(actor, tenantId, targetUserId);
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    const roleTabKeys = await this.tenantRoleNav.effectiveRoleBaseForUser(tenantId, target.role);
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });
    if (!row) return { tabKeys: null, tabAccessModes: null, roleTabKeys };
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    const modes = parseTabAccessModes(row.tabAccessModes);
    const modesOrNull = Object.keys(modes).length ? modes : null;
    return { tabKeys: arr.length ? arr : null, tabAccessModes: modesOrNull, roleTabKeys };
  }

  async setForUser(
    tenantId: string,
    targetUserId: string,
    tabKeys: string[],
    actor: JwtUser,
    hrClinicId?: string,
    tabAccessModes?: Record<string, "read" | "write"> | null,
  ): Promise<{ tabKeys: string[] | null; tabAccessModes: Record<string, "read" | "write"> | null }> {
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    await this.assertCanManageAsync(actor, tenantId, targetUserId);

    const roleBase = await this.tenantRoleNav.effectiveRoleBaseForUser(tenantId, target.role);
    const allowOrganizationTabs = hasRole(actor, UserRole.GROUP_ADMIN);
    const sanitized = sanitizeUserNavTabGrant(target.role, tabKeys, {
      allowOrganizationTabs,
      roleBase,
    });
    const sanitizedModes = sanitizeTabAccessModes(sanitized, tabAccessModes ?? undefined);

    if (isFullRoleNav(target.role, sanitized, roleBase) && sanitizedModes == null) {
      await this.prisma.userNavTabGrant.deleteMany({ where: { tenantId, userId: targetUserId } });
      return { tabKeys: null, tabAccessModes: null };
    }

    const modesData =
      sanitizedModes === null ? Prisma.DbNull : (sanitizedModes as Prisma.InputJsonValue);
    await this.prisma.userNavTabGrant.upsert({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      create: {
        tenantId,
        userId: targetUserId,
        tabKeys: sanitized,
        tabAccessModes: modesData,
        updatedByUserId: actor.userId,
      },
      update: {
        tabKeys: sanitized,
        tabAccessModes: modesData,
        updatedByUserId: actor.userId,
      },
    });

    await this.ensureHrTabHasClinicAssignment(tenantId, targetUserId, target.role, actor, sanitized, hrClinicId);
    const modesOut = sanitizedModes ? parseTabAccessModes(sanitizedModes) : null;
    return { tabKeys: sanitized, tabAccessModes: modesOut };
  }

  private async ensureHrTabHasClinicAssignment(
    tenantId: string,
    targetUserId: string,
    targetRole: UserRole,
    actor: JwtUser,
    sanitizedTabKeys: string[],
    hrClinicId?: string,
  ): Promise<void> {
    if (!sanitizedTabKeys.includes("hr")) return;
    if (targetRole === UserRole.HR_OFFICER || targetRole === UserRole.GROUP_ADMIN) return;

    const existing = await loadResolvedEmployeePrivilegeGrants(this.prisma, tenantId, targetUserId);
    if (existing.length > 0) return;

    const clinicId = hrClinicId?.trim();
    if (!clinicId) {
      throw new BadRequestException(
        "Granting the HR tab requires a clinic HR assignment. Select which clinic this user will be HR for.",
      );
    }

    await this.hrAssignments.assign(tenantId, actor, { userId: targetUserId, clinicId });
  }
}
