import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import {
  capabilitiesFromTemplateRole,
  loadResolvedEmployeePrivilegeGrants,
  type ResolvedEmployeePrivilegeGrant,
} from "../common/employee-privilege-grants";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertClinicAdminCanManageUserNavTabs,
  loadNavTabTargetUser,
} from "../user-nav-tabs/clinic-admin-rbac-policy";
import type { PrivilegeTemplateEmployeeDto, UserClinicPrivilegeGrantDto } from "./dto/user-clinic-privilege-grant.dto";
import type { SetUserClinicPrivilegeGrantDto } from "./dto/set-user-clinic-privilege-grant.dto";

const GRANT_MANAGER_ROLES = new Set<UserRole>([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN]);

function mapGrant(row: ResolvedEmployeePrivilegeGrant): UserClinicPrivilegeGrantDto {
  return {
    id: row.id,
    userId: "",
    clinicId: row.clinicId,
    clinicNameEn: row.clinicNameEn,
    templateEmployeeId: row.templateEmployeeId,
    templateEmployeeName: row.templateEmployeeName,
    templateUserRole: row.templateUserRole,
    canManageEmployees: row.canManageEmployees,
    canArchiveEmployees: row.canArchiveEmployees,
    hrProvisionLogin: row.hrProvisionLogin,
  };
}

@Injectable()
export class UserClinicPrivilegeGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertGrantManager(actor: JwtUser): void {
    if (!GRANT_MANAGER_ROLES.has(actor.role)) {
      throw new ForbiddenException("Only group or clinic administrators may manage employee privilege grants");
    }
  }

  private async assertCanManageGrantForUser(
    tenantId: string,
    actor: JwtUser,
    targetUserId: string,
    clinicId?: string,
  ): Promise<void> {
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    if (target.role === UserRole.GROUP_ADMIN || target.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Cannot delegate privileges onto organization administrators");
    }
    await assertClinicAdminCanManageUserNavTabs(this.prisma, tenantId, actor, target);

    if (actor.role === UserRole.CLINIC_ADMIN && clinicId) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, actor);
      if (!scopeIds?.includes(clinicId)) {
        throw new ForbiddenException("Clinic is outside your assignment");
      }
    }
  }

  async listForUser(tenantId: string, actor: JwtUser, userId: string): Promise<UserClinicPrivilegeGrantDto[]> {
    this.assertGrantManager(actor);
    await this.assertCanManageGrantForUser(tenantId, actor, userId);

    const grants = await loadResolvedEmployeePrivilegeGrants(this.prisma, tenantId, userId);
    if (actor.role === UserRole.CLINIC_ADMIN) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, actor);
      const allowed = new Set(scopeIds ?? []);
      return grants.filter((g) => allowed.has(g.clinicId)).map((g) => ({ ...mapGrant(g), userId }));
    }
    return grants.map((g) => ({ ...mapGrant(g), userId }));
  }

  async listTemplateEmployees(
    tenantId: string,
    actor: JwtUser,
    clinicId: string,
  ): Promise<PrivilegeTemplateEmployeeDto[]> {
    this.assertGrantManager(actor);
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    if (actor.role === UserRole.CLINIC_ADMIN) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, actor);
      if (!scopeIds?.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assignment");
    }

    const rows = await this.prisma.employee.findMany({
      where: {
        tenantId,
        clinicId,
        deletedAt: null,
        userId: { not: null },
        user: { isNot: null },
      },
      select: {
        id: true,
        firstNameEn: true,
        lastNameEn: true,
        jobTitle: true,
        user: { select: { role: true } },
      },
      orderBy: [{ firstNameEn: "asc" }, { lastNameEn: "asc" }],
    });

    return rows
      .filter((r) => r.user)
      .map((r) => {
        const caps = capabilitiesFromTemplateRole(r.user!.role);
        return {
          id: r.id,
          displayName: `${r.firstNameEn} ${r.lastNameEn}`.trim(),
          jobTitle: r.jobTitle,
          userRole: r.user!.role,
          ...caps,
        };
      });
  }

  async upsert(
    tenantId: string,
    actor: JwtUser,
    dto: SetUserClinicPrivilegeGrantDto,
  ): Promise<UserClinicPrivilegeGrantDto> {
    this.assertGrantManager(actor);
    const userId = dto.userId.trim();
    const clinicId = dto.clinicId.trim();
    const templateEmployeeId = dto.templateEmployeeId.trim();
    await this.assertCanManageGrantForUser(tenantId, actor, userId, clinicId);

    const template = await this.prisma.employee.findFirst({
      where: { id: templateEmployeeId, tenantId, deletedAt: null },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!template) throw new BadRequestException("Template employee not found");
    if (template.clinicId !== clinicId) {
      throw new BadRequestException("Template employee must belong to the selected clinic");
    }
    if (!template.user) {
      throw new BadRequestException("Template employee must have a linked login account");
    }
    if (template.user.id === userId) {
      throw new BadRequestException("Cannot copy privileges from the same user's employee record");
    }

    await this.prisma.userClinicEmployeePrivilegeGrant.upsert({
      where: { userId_clinicId: { userId, clinicId } },
      create: {
        tenantId,
        userId,
        clinicId,
        templateEmployeeId,
        updatedByUserId: actor.userId,
      },
      update: {
        templateEmployeeId,
        updatedByUserId: actor.userId,
      },
    });

    const grants = await loadResolvedEmployeePrivilegeGrants(this.prisma, tenantId, userId);
    const saved = grants.find((g) => g.clinicId === clinicId);
    if (!saved) throw new NotFoundException("Grant not found after save");
    return { ...mapGrant(saved), userId };
  }

  async remove(tenantId: string, actor: JwtUser, grantId: string): Promise<{ ok: true }> {
    this.assertGrantManager(actor);
    const row = await this.prisma.userClinicEmployeePrivilegeGrant.findFirst({
      where: { id: grantId, tenantId },
    });
    if (!row) throw new NotFoundException("Grant not found");
    await this.assertCanManageGrantForUser(tenantId, actor, row.userId, row.clinicId);
    await this.prisma.userClinicEmployeePrivilegeGrant.delete({ where: { id: grantId } });
    return { ok: true };
  }
}
