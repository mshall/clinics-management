import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRoleInSet } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";
import { parseStoredNavTabKeys } from "./nav-tab-keys";
import { parseTabAccessModes, tabAccessModeForTab } from "./nav-tab-access-modes";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";

@Injectable()
export class NavTabAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
  ) {}

  private async loadUserGrant(tenantId: string, userId: string) {
    return this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  }

  async effectiveTabKeysForUser(user: JwtUser): Promise<Set<string>> {
    if (user.tenantId == null) return new Set();
    const grant = await this.loadUserGrant(user.tenantId, user.userId);
    const userKeys = grant ? parseStoredNavTabKeys(grant.tabKeys) : null;
    if (userKeys?.length) return new Set(userKeys);
    const roleKeys = await this.tenantRoleNav.effectiveRoleNavTabKeysForPrincipal(user.tenantId, user);
    return new Set(roleKeys);
  }

  async tabAccessModesForUser(user: JwtUser): Promise<ReturnType<typeof parseTabAccessModes>> {
    if (user.tenantId == null) return {};
    const grant = await this.loadUserGrant(user.tenantId, user.userId);
    if (!grant) return {};
    return parseTabAccessModes(grant.tabAccessModes);
  }

  async modeForTabResolved(user: JwtUser, tab: string) {
    const modes = await this.tabAccessModesForUser(user);
    return tabAccessModeForTab(modes, tab);
  }

  async canViewTab(user: JwtUser, tab: string, viewRoles: ReadonlySet<UserRole>): Promise<boolean> {
    if (hasAnyRoleInSet(user, viewRoles)) return true;
    const tabs = await this.effectiveTabKeysForUser(user);
    return tabs.has(tab);
  }

  async canMutateTab(user: JwtUser, tab: string, mutateRoles: ReadonlySet<UserRole>): Promise<boolean> {
    if ((await this.modeForTabResolved(user, tab)) === "read") return false;
    if (hasAnyRoleInSet(user, mutateRoles)) return true;
    const grant = user.tenantId != null ? await this.loadUserGrant(user.tenantId, user.userId) : null;
    const userKeys = grant ? parseStoredNavTabKeys(grant.tabKeys) : null;
    if (!userKeys?.includes(tab)) return false;
    return true;
  }

  async assertViewTab(user: JwtUser, tab: string, viewRoles: ReadonlySet<UserRole>, message: string): Promise<void> {
    if (!(await this.canViewTab(user, tab, viewRoles))) {
      throw new ForbiddenException(message);
    }
  }

  async assertMutateTab(user: JwtUser, tab: string, mutateRoles: ReadonlySet<UserRole>, message: string): Promise<void> {
    if (!(await this.canMutateTab(user, tab, mutateRoles))) {
      throw new ForbiddenException(message);
    }
  }
}