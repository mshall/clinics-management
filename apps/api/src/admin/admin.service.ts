import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";

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
            appointmentDefaultFee: Number(tenant.appointmentDefaultFee),
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
      baseCurrency: r.baseCurrency,
      defaultLocale: r.defaultLocale,
      createdAt: r.createdAt.toISOString(),
      counts: r._count,
    }));
    return paginate(items, total, page, pageSize);
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new BadRequestException("Email already in use for this organization");
    const passwordHash = bcrypt.hashSync(dto.password, 10);
    const row = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        displayName: dto.displayName.trim(),
        passwordHash,
        role: dto.role,
      },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
    };
  }

  async patchTenantSettings(tenantId: string, dto: PatchTenantSettingsDto) {
    if (dto.appointmentDefaultFee === undefined) {
      throw new BadRequestException("No supported fields to update");
    }
    const row = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { appointmentDefaultFee: dto.appointmentDefaultFee },
    });
    return {
      id: row.id,
      name: row.name,
      baseCurrency: row.baseCurrency,
      appointmentDefaultFee: Number(row.appointmentDefaultFee),
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
}
