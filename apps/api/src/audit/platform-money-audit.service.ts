import { ForbiddenException, Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { resolveAuditLogCreatedAtFilter } from "../common/audit-log-query-bounds";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  isMoneyAuditEntityKey,
  moneyAuditWhereForEntity,
  MONEY_AUDIT_ENTITY_KEYS,
} from "./money-audit-entities";

@Injectable()
export class PlatformMoneyAuditService {
  constructor(private readonly prisma: PrismaService) {}

  listEntities(user: JwtUser) {
    this.assertPlatform(user);
    return { entities: [...MONEY_AUDIT_ENTITY_KEYS] };
  }

  async list(
    user: JwtUser,
    opts: {
      entity?: string;
      tenantId?: string;
      page?: string;
      pageSize?: string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    this.assertPlatform(user);
    if (opts.entity && !isMoneyAuditEntityKey(opts.entity)) {
      throw new BadRequestException(`Unknown entity. Use one of: ${MONEY_AUDIT_ENTITY_KEYS.join(", ")}`);
    }

    const { page, pageSize, skip } = parsePageParams(opts.page, opts.pageSize);
    const q = opts.q?.trim().slice(0, 200) ?? "";
    const createdAt = resolveAuditLogCreatedAtFilter(opts.from, opts.to);
    const entityFilter = moneyAuditWhereForEntity(opts.entity);
    const tenantFilter: Prisma.AuditLogWhereInput = opts.tenantId?.trim()
      ? { tenantId: opts.tenantId.trim() }
      : {};

    const where: Prisma.AuditLogWhereInput = {
      AND: [
        entityFilter,
        tenantFilter,
        { createdAt },
        ...(q
          ? [
              {
                OR: [
                  { action: { contains: q, mode: Prisma.QueryMode.insensitive } },
                  { resource: { contains: q, mode: Prisma.QueryMode.insensitive } },
                  { resourceId: { contains: q, mode: Prisma.QueryMode.insensitive } },
                  { actor: { is: { displayName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
                  { actor: { is: { email: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          actor: { select: { displayName: true, email: true, role: true } },
          tenant: { select: { name: true, nameAr: true } },
        },
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      tenantNameAr: r.tenant.nameAr,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      createdAt: r.createdAt.toISOString(),
      actorDisplayName: r.actor?.displayName ?? null,
      actorEmail: r.actor?.email ?? null,
      metadata: r.metadata === null ? null : (r.metadata as Record<string, unknown>),
    }));

    return paginate(items, total, page, pageSize);
  }

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can list platform billing audits");
    }
  }
}