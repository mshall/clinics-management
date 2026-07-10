import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import {
  defaultNavTabsForRole,
  isFullRoleNav,
  maxNavTabsForOrganization,
  parseStoredNavTabKeys,
  sanitizeNavTabKeysForRole,
} from "./nav-tab-keys";

const TENANT_MANAGE_ROLES = new Set<UserRole>([UserRole.GROUP_ADMIN]);

/** Roles that may be customized per organization (excludes platform super admin). */
export const TENANT_CUSTOMIZABLE_ROLES: UserRole[] = [
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.HR_OFFICER,
  UserRole.CLINIC_ADMIN,
  UserRole.CLINIC_ASSISTANT,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
];

@Injectable()
export class TenantRoleNavTabsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertGroupAdmin(actor: JwtUser): void {
    if (actor.role !== UserRole.GROUP_ADMIN) {
      throw new ForbiddenException("Only group administrators may manage role permissions");
    }
  }

  async getRoleGrant(tenantId: string, role: UserRole, actor: JwtUser): Promise<{ tabKeys: string[] | null }> {
    this.assertGroupAdmin(actor);
    if (!TENANT_CUSTOMIZABLE_ROLES.includes(role)) {
      throw new NotFoundException("Role cannot be customized for this organization");
    }
    const row = await this.prisma.tenantRoleNavTabGrant.findUnique({
      where: { tenantId_role: { tenantId, role } },
    });
    return { tabKeys: row ? parseStoredNavTabKeys(row.tabKeys) : null };
  }

  async setRoleGrant(
    tenantId: string,
    role: UserRole,
    tabKeys: string[],
    actor: JwtUser,
  ): Promise<{ tabKeys: string[] | null }> {
    this.assertGroupAdmin(actor);
    if (!TENANT_CUSTOMIZABLE_ROLES.includes(role)) {
      throw new NotFoundException("Role cannot be customized for this organization");
    }

    const orgMax = [...maxNavTabsForOrganization()];
    const sanitized = sanitizeNavTabKeysForRole(role, tabKeys, orgMax);
    if (isFullRoleNav(role, sanitized, defaultNavTabsForRole(role))) {
      await this.prisma.tenantRoleNavTabGrant.deleteMany({ where: { tenantId, role } });
      return { tabKeys: null };
    }

    await this.prisma.tenantRoleNavTabGrant.upsert({
      where: { tenantId_role: { tenantId, role } },
      create: {
        tenantId,
        role,
        tabKeys: sanitized,
        updatedByUserId: actor.userId,
      },
      update: {
        tabKeys: sanitized,
        updatedByUserId: actor.userId,
      },
    });
    return { tabKeys: sanitized };
  }

  async roleNavTabKeysForTenantUser(tenantId: string, role: UserRole): Promise<string[] | null> {
    const row = await this.prisma.tenantRoleNavTabGrant.findUnique({
      where: { tenantId_role: { tenantId, role } },
    });
    return row ? parseStoredNavTabKeys(row.tabKeys) : null;
  }

  async effectiveRoleBaseForUser(tenantId: string, role: UserRole): Promise<string[]> {
    const grant = await this.roleNavTabKeysForTenantUser(tenantId, role);
    return grant?.length ? grant : defaultNavTabsForRole(role);
  }
}
