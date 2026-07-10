import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { isFullRoleNav, sanitizeNavTabKeysForRole } from "./nav-tab-keys";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";

@Injectable()
export class UserNavTabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
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

  async getForUser(tenantId: string, targetUserId: string, actor: JwtUser): Promise<{ tabKeys: string[] | null }> {
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, tenantId } });
    if (!target) throw new NotFoundException("User not found");
    this.assertCanManage(actor, target);
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });
    if (!row) return { tabKeys: null };
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    return { tabKeys: arr.length ? arr : null };
  }

  async setForUser(tenantId: string, targetUserId: string, tabKeys: string[], actor: JwtUser): Promise<{ tabKeys: string[] | null }> {
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, tenantId } });
    if (!target) throw new NotFoundException("User not found");
    this.assertCanManage(actor, target);

    const roleBase = await this.tenantRoleNav.effectiveRoleBaseForUser(tenantId, target.role);
    const sanitized = sanitizeNavTabKeysForRole(target.role, tabKeys, roleBase);
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
    return { tabKeys: sanitized };
  }
}
