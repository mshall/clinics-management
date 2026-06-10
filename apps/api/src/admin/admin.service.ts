import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "../auth/jwt-user";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import type { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";
import {
  buildPlatformHierarchy,
  buildTenantHierarchy,
  resolveVisibleClinicIds,
  type OrgHierarchyNode,
} from "./org-hierarchy";

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

  async listTenantUsers(tenantId: string, pageStr?: string, pageSizeStr?: string) {
    await this.assertTenantExists(tenantId);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const where = { tenantId };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip,
        take: pageSize,
        select: { id: true, email: true, displayName: true, role: true, createdAt: true },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
    }));
    return paginate(items, total, page, pageSize);
  }

  private async assertTenantExists(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!row) throw new NotFoundException("Organization not found");
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
    if (dto.role === UserRole.CLINIC_ADMIN || dto.role === UserRole.BRANCH_MANAGER) {
      const ids = dto.clinicIds ?? [];
      if (!ids.length) {
        throw new BadRequestException("clinicIds is required when creating a clinic administrator or branch manager");
      }
    }
    const passwordHash = bcrypt.hashSync(dto.password, 10);
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
      if ((dto.role === UserRole.CLINIC_ADMIN || dto.role === UserRole.BRANCH_MANAGER) && dto.clinicIds?.length) {
        for (const cid of dto.clinicIds) {
          const c = await tx.clinic.findFirst({ where: { id: cid, tenantId } });
          if (!c) throw new BadRequestException(`Invalid clinicId: ${cid}`);
        }
        await tx.clinicAdminScope.createMany({
          data: dto.clinicIds.map((clinicId) => ({
            tenantId,
            userId: u.id,
            clinicId,
          })),
          skipDuplicates: true,
        });
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
      },
    });
    if (!row) throw new NotFoundException("User not found");
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant?.name ?? null,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      clinicIds: row.clinicAdminScopes.map((s) => s.clinicId),
      clinics: row.clinicAdminScopes.map((s) => ({ id: s.clinic.id, nameEn: s.clinic.nameEn })),
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
        await tx.clinicAdminScope.deleteMany({ where: { tenantId, userId } });
        if (dto.clinicIds.length && (nextRole === UserRole.CLINIC_ADMIN || nextRole === UserRole.BRANCH_MANAGER)) {
          for (const cid of dto.clinicIds) {
            const c = await tx.clinic.findFirst({ where: { id: cid, tenantId } });
            if (!c) throw new BadRequestException(`Invalid clinicId: ${cid}`);
          }
          await tx.clinicAdminScope.createMany({
            data: dto.clinicIds.map((clinicId) => ({ tenantId, userId, clinicId })),
            skipDuplicates: true,
          });
        }
      } else if (dto.role !== undefined && nextRole !== UserRole.CLINIC_ADMIN && nextRole !== UserRole.BRANCH_MANAGER) {
        await tx.clinicAdminScope.deleteMany({ where: { tenantId, userId } });
      }

      return u;
    });

    return this.getTenantUser(tenantId, row.id);
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
        include: { actor: { select: { displayName: true, email: true } } },
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
