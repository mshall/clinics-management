import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType, Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "../auth/jwt-user";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import type { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";
import type { BulkDeleteUsersDto } from "./dto/bulk-delete-users.dto";
import {
  buildPlatformHierarchy,
  buildTenantHierarchy,
  resolveVisibleClinicIds,
  type OrgHierarchyNode,
} from "./org-hierarchy";

const CLINIC_SCOPE_ROLES = new Set<UserRole>([UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

const CLINIC_EMPLOYEE_ROLES = new Set<UserRole>([
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.CLINIC_ASSISTANT,
]);

type ClinicSummary = { id: string; nameEn: string };

function mapUserClinicAssignments(
  scopes: { clinicId: string; clinic: ClinicSummary }[],
  employee: { clinicId: string; clinic: ClinicSummary } | null,
): { clinicIds: string[]; clinics: ClinicSummary[] } {
  const byId = new Map<string, ClinicSummary>();
  for (const s of scopes) byId.set(s.clinic.id, s.clinic);
  if (employee?.clinic && !byId.has(employee.clinic.id)) {
    byId.set(employee.clinic.id, employee.clinic);
  }
  const clinics = [...byId.values()];
  return { clinicIds: clinics.map((c) => c.id), clinics };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(currentTenantId: string) {
    const [tenant, tenantCount, flags, recentAudit] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: currentTenantId } }),
      this.prisma.tenant.count(),
      this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      this.prisma.auditLog.findMany({
        where: { tenantId: currentTenantId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);
    return {
      currentTenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            baseCurrency: tenant.baseCurrency,
            defaultVisitFee: Number(tenant.defaultVisitFee),
          }
        : null,
      registeredTenants: tenantCount,
      featureFlags: flags.map((f) => ({
        id: f.id,
        key: f.key,
        enabled: f.enabled,
        description: f.description,
      })),
      recentAudit: recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        resource: a.resource,
        resourceId: a.resourceId,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async listTenants(pageStr?: string, pageSizeStr?: string, sortByStr?: string, sortOrderStr?: string) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["name", "createdAt", "baseCurrency"] as const, "name");
    const sortDir = parseSortOrder(sortOrderStr);
    const [total, rows] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.findMany({
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          nameAr: true,
          baseCurrency: true,
          defaultLocale: true,
          createdAt: true,
          _count: { select: { users: true, clinics: true, patients: true } },
        },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      baseCurrency: r.baseCurrency,
      defaultLocale: r.defaultLocale,
      createdAt: r.createdAt.toISOString(),
      counts: r._count,
    }));
    return paginate(items, total, page, pageSize);
  }

  async listTenantUsers(tenantId: string, pageStr?: string, pageSizeStr?: string, qRaw?: string) {
    await this.assertTenantExists(tenantId);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const where = this.buildTenantUserWhere(tenantId, qRaw);
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip,
        take: pageSize,
        include: {
          clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
          employee: { include: { clinic: { select: { id: true, nameEn: true } } } },
        },
      }),
    ]);
    const items = rows.map((r) => {
      const clinics = mapUserClinicAssignments(r.clinicAdminScopes, r.employee);
      return {
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        ...clinics,
      };
    });
    return paginate(items, total, page, pageSize);
  }

  private buildTenantUserWhere(tenantId: string, qRaw?: string): Prisma.UserWhereInput {
    const q = qRaw?.trim() ?? "";
    return {
      tenantId,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  private async assertTenantExists(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!row) throw new NotFoundException("Organization not found");
  }

  private jobTitleForRole(role: UserRole): string {
    switch (role) {
      case UserRole.PHYSICIAN:
        return "Physician";
      case UserRole.NURSE:
        return "Nurse";
      case UserRole.RECEPTIONIST:
        return "Receptionist";
      case UserRole.CLINIC_ASSISTANT:
        return "Clinic Assistant";
      case UserRole.BRANCH_MANAGER:
        return "Branch Manager";
      case UserRole.CLINIC_ADMIN:
        return "Clinic Administrator";
      default:
        return "Staff";
    }
  }

  private async nextEmployeeNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const rows = await tx.employee.findMany({
      where: { tenantId, employeeNumber: { startsWith: "EMP-" } },
      select: { employeeNumber: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /^EMP-(\d+)$/i.exec(r.employeeNumber.trim());
      if (m) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    return `EMP-${max + 1}`;
  }

  private async assertClinicIdsBelongToTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clinicIds: string[],
  ): Promise<void> {
    for (const cid of clinicIds) {
      const c = await tx.clinic.findFirst({ where: { id: cid, tenantId } });
      if (!c) throw new BadRequestException(`Invalid clinicId: ${cid}`);
    }
  }

  private async syncClinicAdminScopes(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    clinicIds: string[],
  ): Promise<void> {
    await tx.clinicAdminScope.deleteMany({ where: { tenantId, userId } });
    if (!clinicIds.length) return;
    await this.assertClinicIdsBelongToTenant(tx, tenantId, clinicIds);
    await tx.clinicAdminScope.createMany({
      data: clinicIds.map((clinicId) => ({ tenantId, userId, clinicId })),
      skipDuplicates: true,
    });
  }

  private async syncLinkedEmployeeClinic(
    tx: Prisma.TransactionClient,
    tenantId: string,
    user: { id: string; email: string; displayName: string; role: UserRole },
    primaryClinicId: string | null,
  ): Promise<void> {
    if (!CLINIC_EMPLOYEE_ROLES.has(user.role)) return;
    const existing = await tx.employee.findFirst({ where: { userId: user.id } });
    if (!primaryClinicId) {
      if (existing) {
        await tx.employee.update({ where: { id: existing.id }, data: { userId: null } });
      }
      return;
    }
    const parts = user.displayName.trim().split(/\s+/);
    const firstNameEn = parts[0] ?? user.displayName;
    const lastNameEn = parts.slice(1).join(" ") || "Staff";
    if (existing) {
      await tx.employee.update({
        where: { id: existing.id },
        data: { clinicId: primaryClinicId, email: user.email, userId: user.id },
      });
      return;
    }
    await tx.employee.create({
      data: {
        tenantId,
        clinicId: primaryClinicId,
        userId: user.id,
        employeeNumber: await this.nextEmployeeNumber(tx, tenantId),
        firstNameEn,
        lastNameEn,
        email: user.email,
        phone: "+0000000000",
        jobTitle: this.jobTitleForRole(user.role),
        employmentType: EmploymentType.FULL_TIME,
        hireDate: new Date(),
        salaryBase: 0,
      },
    });
  }

  async listFeatureFlags() {
    const flags = await this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
    return flags.map((f) => ({
      id: f.id,
      key: f.key,
      enabled: f.enabled,
      description: f.description,
    }));
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto) {
    const email = dto.email.toLowerCase().trim();
    if (dto.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException("Cannot create platform super administrators through this endpoint");
    }
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new BadRequestException("Email already in use for this organization");
    if (CLINIC_SCOPE_ROLES.has(dto.role) && !(dto.clinicIds?.length ?? 0)) {
      throw new BadRequestException("clinicIds is required when creating a clinic administrator or branch manager");
    }
    const passwordHash = bcrypt.hashSync(dto.password, 10);
    const clinicIds = dto.clinicIds ?? [];
    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId,
          email,
          displayName: dto.displayName.trim(),
          passwordHash,
          role: dto.role,
        },
      });
      if (clinicIds.length) {
        await this.syncClinicAdminScopes(tx, tenantId, u.id, clinicIds);
        await this.syncLinkedEmployeeClinic(tx, tenantId, u, clinicIds[0] ?? null);
      }
      return u;
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
    };
  }

  async getTenantUser(tenantId: string, userId: string) {
    await this.assertTenantExists(tenantId);
    const row = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        tenant: { select: { id: true, name: true } },
        clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
        employee: { include: { clinic: { select: { id: true, nameEn: true } } } },
      },
    });
    if (!row) throw new NotFoundException("User not found");
    const clinics = mapUserClinicAssignments(row.clinicAdminScopes, row.employee);
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant?.name ?? null,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      ...clinics,
    };
  }

  async updateTenantUser(tenantId: string, userId: string, dto: PlatformPatchTenantUserDto) {
    await this.assertTenantExists(tenantId);
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new NotFoundException("User not found");
    if (existing.role === UserRole.PLATFORM_SUPER_ADMIN || dto.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException("Cannot modify platform super administrators through this endpoint");
    }

    const nextRole = dto.role ?? existing.role;
    if (nextRole === UserRole.CLINIC_ADMIN || nextRole === UserRole.BRANCH_MANAGER) {
      if (dto.clinicIds !== undefined && !dto.clinicIds.length) {
        throw new BadRequestException("clinicIds is required for clinic administrator or branch manager");
      }
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const clash = await this.prisma.user.findFirst({ where: { tenantId, email, NOT: { id: userId } } });
      if (clash) throw new BadRequestException("Email already in use for this organization");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.password !== undefined ? { passwordHash: bcrypt.hashSync(dto.password, 10) } : {}),
        },
      });

      if (dto.clinicIds !== undefined) {
        await this.syncClinicAdminScopes(tx, tenantId, userId, dto.clinicIds);
        await this.syncLinkedEmployeeClinic(tx, tenantId, u, dto.clinicIds[0] ?? null);
      } else if (dto.role !== undefined && !CLINIC_EMPLOYEE_ROLES.has(nextRole)) {
        await this.syncLinkedEmployeeClinic(tx, tenantId, u, null);
      }

      return u;
    });

    return this.getTenantUser(tenantId, row.id);
  }

  async deleteTenantUser(tenantId: string, userId: string, actor: JwtUser) {
    await this.assertTenantExists(tenantId);
    if (actor.userId === userId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new NotFoundException("User not found");
    if (existing.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException("Cannot delete platform super administrators");
    }

    const [encounters, appointments, operations] = await Promise.all([
      this.prisma.encounter.count({ where: { clinicianId: userId } }),
      this.prisma.appointment.count({ where: { clinicianId: userId } }),
      this.prisma.operation.count({ where: { clinicianId: userId } }),
    ]);
    if (encounters + appointments + operations > 0) {
      throw new BadRequestException(
        "Cannot delete a user linked to encounters, appointments, or operations. Reassign clinical records first.",
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true, id: userId };
  }

  async deleteTenantUsersBulk(tenantId: string, dto: BulkDeleteUsersDto, actor: JwtUser) {
    await this.assertTenantExists(tenantId);
    let ids: string[];
    if (dto.all) {
      const rows = await this.prisma.user.findMany({
        where: this.buildTenantUserWhere(tenantId, dto.search),
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    } else {
      ids = [...new Set((dto.ids ?? []).map((id) => id.trim()).filter(Boolean))];
      if (!ids.length) throw new BadRequestException("ids required unless all=true");
    }

    ids = ids.filter((id) => id !== actor.userId);
    let deleted = 0;
    const failed: { id: string; message: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteTenantUser(tenantId, id, actor);
        deleted += 1;
      } catch (e) {
        const message =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? String(e.message)
            : e instanceof Error
              ? e.message
              : "Delete failed";
        failed.push({ id, message });
      }
    }

    return { ok: true, deleted, failed };
  }

  async auditLogs(tenantId: string, pageStr: string | undefined, pageSizeStr: string | undefined, qRaw: string | undefined, user: JwtUser) {
    if (user.role !== UserRole.GROUP_ADMIN && user.role !== UserRole.CLINIC_ADMIN && user.role !== UserRole.BRANCH_MANAGER) {
      throw new ForbiddenException("Only administrators may list audit logs");
    }
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const q = qRaw?.trim() ?? "";
    let scopeClinicIds: string[] | null = null;
    const auditScope = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (auditScope !== null) {
      scopeClinicIds = auditScope;
      if (!scopeClinicIds.length) {
        return paginate([], 0, page, pageSize);
      }
    }
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(scopeClinicIds ? { clinicId: { in: scopeClinicIds } } : {}),
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" } },
              { resource: { contains: q, mode: "insensitive" } },
              { actor: { is: { displayName: { contains: q, mode: "insensitive" } } } },
              { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { actor: { select: { displayName: true, email: true, role: true } } },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      clinicId: r.clinicId,
      createdAt: r.createdAt.toISOString(),
      actorDisplayName: r.actor?.displayName ?? null,
      actorEmail: r.actor?.email ?? null,
      actorRole: r.actor?.role ?? null,
      metadata: r.metadata === null ? null : (r.metadata as Record<string, unknown>),
    }));
    return paginate(items, total, page, pageSize);
  }

  async patchTenantSettings(tenantId: string, dto: PatchTenantSettingsDto) {
    if (dto.defaultVisitFee === undefined) {
      throw new BadRequestException("No supported fields to update");
    }
    const row = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultVisitFee: dto.defaultVisitFee },
    });
    return {
      id: row.id,
      name: row.name,
      baseCurrency: row.baseCurrency,
      defaultVisitFee: Number(row.defaultVisitFee),
    };
  }

  async setFeatureFlag(key: string, enabled: boolean) {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!row) throw new NotFoundException("Feature flag not found");
    return this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });
  }

  async getOrgHierarchyForUser(user: JwtUser, tenantId: string): Promise<OrgHierarchyNode> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const visible = await resolveVisibleClinicIds(this.prisma, tenantId, scopeIds);
    return buildTenantHierarchy(this.prisma, tenantId, visible);
  }

  getPlatformHierarchy(tenantIdFilter?: string): Promise<OrgHierarchyNode> {
    return buildPlatformHierarchy(this.prisma, tenantIdFilter);
  }
}
