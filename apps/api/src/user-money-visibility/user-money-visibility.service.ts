import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinancialVisibilityOverride, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { normalizeMoneyAccessOverride } from "../common/money-access-override";
import {
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  loadUserMoneyVisibilityOverrides,
} from "../common/user-money-visibility";
import { PrismaService } from "../prisma/prisma.service";
import { loadNavTabTargetUser } from "../user-nav-tabs/clinic-admin-rbac-policy";
import type { UserMoneyVisibilityDto, UserMoneyVisibilityResponseDto } from "./dto/user-money-visibility.dto";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";

const MANAGE_ROLES = new Set<UserRole>([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN]);

@Injectable()
export class UserMoneyVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(actor: JwtUser): void {
    if (!hasAnyRoleInSet(actor, MANAGE_ROLES)) {
      throw new ForbiddenException("Only organization administrators may edit money visibility");
    }
  }

  async getForUser(tenantId: string, userId: string, actor: JwtUser): Promise<UserMoneyVisibilityResponseDto> {
    this.assertManager(actor);
    await loadNavTabTargetUser(this.prisma, tenantId, userId);
    return loadUserMoneyVisibilityOverrides(this.prisma, tenantId, userId);
  }

  async setForUser(
    tenantId: string,
    userId: string,
    body: UserMoneyVisibilityDto,
    actor: JwtUser,
  ): Promise<UserMoneyVisibilityResponseDto> {
    this.assertManager(actor);
    const target = await loadNavTabTargetUser(this.prisma, tenantId, userId);
    if (hasAnyRole(target, [UserRole.GROUP_ADMIN, UserRole.PLATFORM_SUPER_ADMIN])) {
      throw new ForbiddenException("Cannot customize money visibility for organization administrators");
    }

    const operations = normalizeMoneyAccessOverride(body.operations);
    const encounters = normalizeMoneyAccessOverride(body.encounters);
    const appointments = normalizeMoneyAccessOverride(body.appointments);

    const allDefault =
      operations === FinancialVisibilityOverride.ROLE_DEFAULT &&
      encounters === FinancialVisibilityOverride.ROLE_DEFAULT &&
      appointments === FinancialVisibilityOverride.ROLE_DEFAULT;

    if (allDefault) {
      await this.prisma.userMoneyVisibilityOverride.deleteMany({ where: { tenantId, userId } });
      return { ...DEFAULT_MONEY_VISIBILITY_OVERRIDES };
    }

    await this.prisma.userMoneyVisibilityOverride.upsert({
      where: { userId },
      create: {
        tenantId,
        userId,
        operationsOverride: operations,
        encountersOverride: encounters,
        appointmentsOverride: appointments,
        updatedByUserId: actor.userId,
      },
      update: {
        operationsOverride: operations,
        encountersOverride: encounters,
        appointmentsOverride: appointments,
        updatedByUserId: actor.userId,
      },
    });

    return { operations, encounters, appointments };
  }
}