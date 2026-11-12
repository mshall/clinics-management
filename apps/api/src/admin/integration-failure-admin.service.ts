import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IntegrationFailureStatus, Prisma, UserRole } from "@prisma/client";
import { resolveAuditLogCreatedAtFilter } from "../common/audit-log-query-bounds";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { paginate, parsePageParams } from "../common/pagination";
import type { JwtUser } from "../auth/jwt-user";
import {
  resolveIntegrationFailureHintsForLocale,
} from "../integrations/integration-failure-hints";
import {
  buildFailureReasonDetail,
  formatCategoryLabel,
  formatIntegrationOperationName,
  summarizeFailureReason,
} from "../integrations/integration-failure-labels";
import { IntegrationFailureRetentionService } from "../integrations/integration-failure-retention.service";
import { IntegrationWebhookService } from "../integrations/integration-webhook.service";
import { PrismaService } from "../prisma/prisma.service";
import type { PatchIntegrationFailureDto } from "./dto/patch-integration-failure.dto";

type FailureFilters = {
  from?: string;
  to?: string;
  category?: string;
  integrationClientId?: string;
  clinicId?: string;
  status?: string;
  locale?: string;
};

@Injectable()
export class IntegrationFailureAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: IntegrationWebhookService,
    private readonly retention: IntegrationFailureRetentionService,
  ) {}

  private assertAdmin(user: JwtUser) {
    if (
      user.role !== UserRole.GROUP_ADMIN &&
      user.role !== UserRole.CLINIC_ADMIN &&
      user.role !== UserRole.BRANCH_MANAGER
    ) {
      throw new ForbiddenException("Only administrators may access integration failures");
    }
  }

  private async buildWhere(tenantId: string, user: JwtUser, filters: FailureFilters, qBounded: string) {
    const scopeClinicIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const createdAt = resolveAuditLogCreatedAtFilter(filters.from, filters.to);
    const categoryFilter = filters.category?.trim();
    const categoryEnum = categoryFilter
      ? (["AUTH", "APPOINTMENT", "OPERATION", "WEBHOOK"] as const).find((c) => c === categoryFilter.toUpperCase())
      : undefined;
    const statusFilter = filters.status?.trim().toUpperCase();
    const statusEnum = statusFilter
      ? (["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const).find((s) => s === statusFilter)
      : undefined;

    const where: Prisma.IntegrationFailureLogWhereInput = {
      tenantId,
      createdAt,
      ...(categoryEnum ? { category: categoryEnum } : {}),
      ...(statusEnum ? { status: statusEnum } : {}),
      ...(filters.integrationClientId?.trim() ? { integrationClientId: filters.integrationClientId.trim() } : {}),
      ...(filters.clinicId?.trim() ? { clinicId: filters.clinicId.trim() } : {}),
      ...(scopeClinicIds
        ? {
            OR: [{ clinicId: { in: scopeClinicIds } }, { clinicId: null }],
          }
        : {}),
      ...(qBounded
        ? {
            OR: [
              { id: { contains: qBounded, mode: "insensitive" } },
              { errorMessage: { contains: qBounded, mode: "insensitive" } },
              { reason: { contains: qBounded, mode: "insensitive" } },
              { reasonDetail: { contains: qBounded, mode: "insensitive" } },
              { operation: { contains: qBounded, mode: "insensitive" } },
              { operationName: { contains: qBounded, mode: "insensitive" } },
              { operationTypeLabel: { contains: qBounded, mode: "insensitive" } },
              { httpPath: { contains: qBounded, mode: "insensitive" } },
              { integrationClientName: { contains: qBounded, mode: "insensitive" } },
              { correlationId: { contains: qBounded, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return { where, scopeClinicIds };
  }

  async list(
    tenantId: string,
    pageStr: string | undefined,
    pageSizeStr: string | undefined,
    qRaw: string | undefined,
    user: JwtUser,
    filters: FailureFilters,
  ) {
    this.assertAdmin(user);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const qBounded = (qRaw?.trim() ?? "").slice(0, 200);
    const { where, scopeClinicIds } = await this.buildWhere(tenantId, user, filters, qBounded);
    if (scopeClinicIds && !scopeClinicIds.length) return paginate([], 0, page, pageSize);

    const [total, rows] = await Promise.all([
      this.prisma.integrationFailureLog.count({ where }),
      this.prisma.integrationFailureLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          clinic: { select: { nameEn: true, nameAr: true } },
          integrationClient: { select: { clientKey: true } },
          resolvedBy: { select: { id: true, displayName: true } },
        },
      }),
    ]);

    const items = rows.map((r) => this.mapRow(r, filters.locale));
    return paginate(items, total, page, pageSize);
  }

  async byId(tenantId: string, id: string, user: JwtUser, locale?: string) {
    this.assertAdmin(user);
    const row = await this.prisma.integrationFailureLog.findFirst({
      where: { id, tenantId },
      include: {
        clinic: { select: { nameEn: true, nameAr: true } },
        integrationClient: { select: { clientKey: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });
    if (!row) throw new NotFoundException("Integration failure not found");
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && row.clinicId && !scopeIds.includes(row.clinicId)) {
      throw new ForbiddenException("Failure is outside your clinic scope");
    }
    return this.mapRow(row, locale);
  }

  async summary(tenantId: string, user: JwtUser) {
    this.assertAdmin(user);
    const since = new Date(Date.now() - 86_400_000);
    const sinceHour = new Date(Date.now() - 3_600_000);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { integrationFailureRetentionDays: true, integrationFailureLastSpikeAlertAt: true },
    });
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const scopeWhere: Prisma.IntegrationFailureLogWhereInput =
      scopeIds && scopeIds.length
        ? { OR: [{ clinicId: { in: scopeIds } }, { clinicId: null }] }
        : scopeIds
          ? { id: "__none__" }
          : {};

    const baseWhere: Prisma.IntegrationFailureLogWhereInput = { tenantId, ...scopeWhere };

    const [total24h, lastHour, openCount, byCategory, recentSpikeAudit] = await Promise.all([
      this.prisma.integrationFailureLog.count({ where: { ...baseWhere, createdAt: { gte: since } } }),
      this.prisma.integrationFailureLog.count({ where: { ...baseWhere, createdAt: { gte: sinceHour } } }),
      this.prisma.integrationFailureLog.count({
        where: { ...baseWhere, status: IntegrationFailureStatus.OPEN },
      }),
      this.prisma.integrationFailureLog.groupBy({
        by: ["category"],
        where: { ...baseWhere, createdAt: { gte: since } },
        _count: true,
      }),
      this.prisma.auditLog.findFirst({
        where: { tenantId, action: "INTEGRATION_FAILURE_SPIKE", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true },
      }),
    ]);

    const spikeDetected = lastHour >= 8;
    return {
      totalLast24h: total24h,
      failuresLastHour: lastHour,
      openCount,
      byCategory: byCategory.map((r) => ({ category: r.category, count: r._count })),
      retentionDays: tenant?.integrationFailureRetentionDays ?? 30,
      spikeDetected,
      recentSpikeAlertAt: tenant?.integrationFailureLastSpikeAlertAt?.toISOString() ?? null,
      recentSpikeAuditAt: recentSpikeAudit?.createdAt.toISOString() ?? null,
    };
  }

  async groups(
    tenantId: string,
    pageStr: string | undefined,
    pageSizeStr: string | undefined,
    user: JwtUser,
    filters: FailureFilters,
  ) {
    this.assertAdmin(user);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const { where, scopeClinicIds } = await this.buildWhere(tenantId, user, filters, "");
    if (scopeClinicIds && !scopeClinicIds.length) return paginate([], 0, page, pageSize);

    const groupedWhere: Prisma.IntegrationFailureLogWhereInput = { ...where, fingerprint: { not: null } };
    const fingerprints = await this.prisma.integrationFailureLog.groupBy({
      by: ["fingerprint"],
      where: groupedWhere,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      skip,
      take: pageSize,
    });
    const totalGroups = await this.prisma.integrationFailureLog.groupBy({
      by: ["fingerprint"],
      where: groupedWhere,
      _count: { _all: true },
    });

    const items = await Promise.all(
      fingerprints.map(async (g) => {
        if (!g.fingerprint) return null;
        const latest = await this.prisma.integrationFailureLog.findFirst({
          where: { ...where, fingerprint: g.fingerprint },
          orderBy: { createdAt: "desc" },
          include: {
            clinic: { select: { nameEn: true, nameAr: true } },
            integrationClient: { select: { clientKey: true } },
            resolvedBy: { select: { id: true, displayName: true } },
          },
        });
        if (!latest) return null;
        const openInGroup = await this.prisma.integrationFailureLog.count({
          where: {
            tenantId,
            fingerprint: g.fingerprint,
            status: IntegrationFailureStatus.OPEN,
          },
        });
        return {
          fingerprint: g.fingerprint,
          count: g._count._all,
          openCount: openInGroup,
          lastSeenAt: g._max.createdAt?.toISOString() ?? null,
          latestFailureId: latest.id,
          latest: this.mapRow(latest, filters.locale),
        };
      }),
    );

    return paginate(
      items.filter((x): x is NonNullable<typeof x> => x !== null),
      totalGroups.length,
      page,
      pageSize,
    );
  }

  async exportCsv(tenantId: string, user: JwtUser, filters: FailureFilters, qRaw?: string) {
    this.assertAdmin(user);
    const qBounded = (qRaw?.trim() ?? "").slice(0, 200);
    const { where, scopeClinicIds } = await this.buildWhere(tenantId, user, filters, qBounded);
    if (scopeClinicIds && !scopeClinicIds.length) return "";

    const rows = await this.prisma.integrationFailureLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      "id",
      "createdAt",
      "status",
      "category",
      "operationName",
      "reason",
      "statusCode",
      "client",
      "clinicId",
      "correlationId",
    ].join(",");
    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt.toISOString(),
        r.status,
        r.category,
        r.operationName ?? r.operation,
        r.reason ?? "",
        String(r.statusCode),
        r.integrationClientName ?? "",
        r.clinicId ?? "",
        r.correlationId ?? "",
      ]
        .map((c) => escape(String(c)))
        .join(","),
    );
    return [header, ...lines].join("\n");
  }

  async patchStatus(tenantId: string, id: string, user: JwtUser, dto: PatchIntegrationFailureDto) {
    this.assertAdmin(user);
    const row = await this.prisma.integrationFailureLog.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Integration failure not found");
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && row.clinicId && !scopeIds.includes(row.clinicId)) {
      throw new ForbiddenException("Failure is outside your clinic scope");
    }

    const resolved = dto.status === IntegrationFailureStatus.RESOLVED;
    const updated = await this.prisma.integrationFailureLog.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote?.trim() || row.resolutionNote,
        resolvedAt: resolved ? new Date() : null,
        resolvedByUserId: resolved ? user.userId : null,
      },
      include: {
        clinic: { select: { nameEn: true, nameAr: true } },
        integrationClient: { select: { clientKey: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });
    return this.mapRow(updated);
  }

  async retryWebhook(tenantId: string, id: string, user: JwtUser) {
    this.assertAdmin(user);
    return this.webhooks.retryDeliveryFromFailureLog(tenantId, id);
  }

  async purgeNow(tenantId: string, user: JwtUser) {
    if (user.role !== UserRole.GROUP_ADMIN) {
      throw new ForbiddenException("Only group administrators may run retention purge");
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { integrationFailureRetentionDays: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    const deleted = await this.retention.purgeTenant(tenantId, tenant.integrationFailureRetentionDays);
    return { deleted, retentionDays: tenant.integrationFailureRetentionDays };
  }

  private mapRow(
    r: Prisma.IntegrationFailureLogGetPayload<{
      include: {
        clinic: { select: { nameEn: true; nameAr: true } };
        integrationClient: { select: { clientKey: true } };
        resolvedBy: { select: { id: true; displayName: true } };
      };
    }>,
    locale?: string,
  ) {
    const resolution = resolveIntegrationFailureHintsForLocale(
      locale,
      r.category,
      r.operation,
      r.statusCode,
      r.errorMessage,
    );
    const operationName = r.operationName ?? formatIntegrationOperationName(r.operation, r.category);
    const operationTypeLabel = r.operationTypeLabel ?? formatCategoryLabel(r.category);
    const reason = r.reason ?? summarizeFailureReason(r.statusCode, r.errorCode, r.errorMessage);
    const reasonDetail =
      r.reasonDetail ??
      buildFailureReasonDetail(r.statusCode, r.errorCode, r.errorMessage, r.httpMethod, r.httpPath);
    const ctx = r.requestContext === null ? null : (r.requestContext as Record<string, unknown>);
    const externalReference = typeof ctx?.externalReference === "string" ? ctx.externalReference : null;
    const canRetryWebhook = r.category === "WEBHOOK" && Boolean(ctx?.payloadBody && ctx?.webhookId);

    return {
      id: r.id,
      category: r.category,
      operationType: r.category,
      operationTypeLabel,
      operation: r.operation,
      operationName,
      operationCode: r.operation,
      reason,
      reasonDetail,
      fingerprint: r.fingerprint,
      workflowStatus: r.status,
      resolutionNote: r.resolutionNote,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: r.resolvedByUserId,
      resolvedByDisplayName: r.resolvedBy?.displayName ?? null,
      httpMethod: r.httpMethod,
      httpPath: r.httpPath,
      statusCode: r.statusCode,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      integrationClientId: r.integrationClientId,
      integrationClientName: r.integrationClientName,
      integrationClientKey: r.integrationClient?.clientKey ?? null,
      clinicId: r.clinicId,
      clinicNameEn: r.clinic?.nameEn ?? null,
      clinicNameAr: r.clinic?.nameAr ?? null,
      correlationId: r.correlationId,
      trace: r.trace,
      requestContext: ctx,
      externalReference,
      canRetryWebhook,
      createdAt: r.createdAt.toISOString(),
      resolution,
    };
  }
}
