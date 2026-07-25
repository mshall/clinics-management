import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { loadResolvedEmployeePrivilegeGrants } from "../common/employee-privilege-grants";
import { PrismaService } from "../prisma/prisma.service";
import { UserClinicPrivilegeGrantsService } from "../user-clinic-privilege-grants/user-clinic-privilege-grants.service";
import { isFullRoleNav, sanitizeUserNavTabGrant } from "./nav-tab-keys";
import {
  assertClinicAdminCanManageUserNavTabs,
  loadNavTabTargetUser,
} from "./clinic-admin-rbac-policy";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";

@Injectable()
export class UserNavTabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
    private readonly hrAssignments: UserClinicPrivilegeGrantsService,
  ) {}

  private assertCanManage(actor: JwtUser, target: { id: string; role: UserRole; tenantId: string | null }): void {
    if (actor.tenantId == null || target.tenantId !== actor.tenantId) throw new ForbiddenException();
    if (actor.role === UserRole.GROUP_ADMIN) return;
    if (actor.role === UserRole.CLINIC_ADMIN) {
      if (target.role === UserRole.GROUP_ADMIN || target.role === UserRole.CLINIC_ADMIN) {
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

  async getForUser(tenantId: string, targetUserId: string, actor: JwtUser): Promise<{ tabKeys: string[] | null }> {
    await this.assertCanManageAsync(actor, tenantId, targetUserId);
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });
    if (!row) return { tabKeys: null };
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    return { tabKeys: arr.length ? arr : null };
  }

  async setForUser(
    tenantId: string,
    targetUserId: string,
    tabKeys: string[],
    actor: JwtUser,
    hrClinicId?: string,
  ): Promise<{ tabKeys: string[] | null }> {
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    await this.assertCanManageAsync(actor, tenantId, targetUserId);

    const roleBase = await this.tenantRoleNav.effectiveRoleBaseForUser(tenantId, target.role);
    const allowOrganizationTabs = actor.role === UserRole.GROUP_ADMIN;
    const sanitized = sanitizeUserNavTabGrant(target.role, tabKeys, {
      allowOrganizationTabs,
      roleBase,
    });
    if (isFullRoleNav(target.role, sanitized, roleBase)) {
      await this.prisma.userNavTabGrant.deleteMany({ where: { tenantId, userId: targetUserId } });
      return { tabKeys: null };
    }

    await this.prisma.userNavTabGrant.upsert({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      create: {
        tenantId,
        userId: targetUserId,
        tabKeys: sanitized,
        updatedByUserId: actor.userId,
      },
      update: {
        tabKeys: sanitized,
        updatedByUserId: actor.userId,
      },
    });

    await this.ensureHrTabHasClinicAssignment(tenantId, targetUserId, target.role, actor, sanitized, hrClinicId);
    return { tabKeys: sanitized };
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
