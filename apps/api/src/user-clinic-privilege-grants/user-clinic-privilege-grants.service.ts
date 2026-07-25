import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { loadResolvedEmployeePrivilegeGrants } from "../common/employee-privilege-grants";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertClinicAdminCanManageUserNavTabs,
  loadNavTabTargetUser,
} from "../user-nav-tabs/clinic-admin-rbac-policy";
import type { UserClinicHrAssignmentDto } from "./dto/user-clinic-privilege-grant.dto";
import type { SetUserClinicHrAssignmentDto } from "./dto/set-user-clinic-privilege-grant.dto";

const HR_ASSIGNMENT_MANAGER_ROLES = new Set<UserRole>([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN]);

@Injectable()
export class UserClinicPrivilegeGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertHrAssignmentManager(actor: JwtUser): void {
    if (!HR_ASSIGNMENT_MANAGER_ROLES.has(actor.role)) {
      throw new ForbiddenException("Only group or clinic administrators may assign clinic HR roles");
    }
  }

  private async assertCanManageHrAssignmentForUser(
    tenantId: string,
    actor: JwtUser,
    targetUserId: string,
    clinicId?: string,
  ): Promise<void> {
    const target = await loadNavTabTargetUser(this.prisma, tenantId, targetUserId);
    if (target.role === UserRole.GROUP_ADMIN || target.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Cannot assign clinic HR role to organization administrators");
    }
    if (target.role === UserRole.HR_OFFICER) {
      throw new BadRequestException("This user is already an organization HR officer");
    }
    await assertClinicAdminCanManageUserNavTabs(this.prisma, tenantId, actor, target);

    if (actor.role === UserRole.CLINIC_ADMIN && clinicId) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, actor);
      if (!scopeIds?.includes(clinicId)) {
        throw new ForbiddenException("Clinic is outside your assignment");
      }
    }
  }

  async listForUser(tenantId: string, actor: JwtUser, userId: string): Promise<UserClinicHrAssignmentDto[]> {
    this.assertHrAssignmentManager(actor);
    await this.assertCanManageHrAssignmentForUser(tenantId, actor, userId);

    const assignments = await loadResolvedEmployeePrivilegeGrants(this.prisma, tenantId, userId);
    if (actor.role === UserRole.CLINIC_ADMIN) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, actor);
      const allowed = new Set(scopeIds ?? []);
      return assignments
        .filter((a) => allowed.has(a.clinicId))
        .map((a) => ({
          id: a.id,
          userId,
          clinicId: a.clinicId,
          clinicNameEn: a.clinicNameEn,
        }));
    }
    return assignments.map((a) => ({
      id: a.id,
      userId,
      clinicId: a.clinicId,
      clinicNameEn: a.clinicNameEn,
    }));
  }

  async assign(
    tenantId: string,
    actor: JwtUser,
    dto: SetUserClinicHrAssignmentDto,
  ): Promise<UserClinicHrAssignmentDto> {
    this.assertHrAssignmentManager(actor);
    const userId = dto.userId.trim();
    const clinicId = dto.clinicId.trim();
    await this.assertCanManageHrAssignmentForUser(tenantId, actor, userId, clinicId);

    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new BadRequestException("Clinic not found");

    await this.prisma.userClinicEmployeePrivilegeGrant.upsert({
      where: { userId_clinicId: { userId, clinicId } },
      create: {
        tenantId,
        userId,
        clinicId,
        updatedByUserId: actor.userId,
      },
      update: {
        updatedByUserId: actor.userId,
      },
    });

    const assignments = await loadResolvedEmployeePrivilegeGrants(this.prisma, tenantId, userId);
    const saved = assignments.find((a) => a.clinicId === clinicId);
    if (!saved) throw new NotFoundException("HR assignment not found after save");
    return {
      id: saved.id,
      userId,
      clinicId,
      clinicNameEn: saved.clinicNameEn,
    };
  }

  async remove(tenantId: string, actor: JwtUser, assignmentId: string): Promise<{ ok: true }> {
    this.assertHrAssignmentManager(actor);
    const row = await this.prisma.userClinicEmployeePrivilegeGrant.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!row) throw new NotFoundException("HR assignment not found");
    await this.assertCanManageHrAssignmentForUser(tenantId, actor, row.userId, row.clinicId);
    await this.prisma.userClinicEmployeePrivilegeGrant.delete({ where: { id: assignmentId } });
    return { ok: true };
  }
}
