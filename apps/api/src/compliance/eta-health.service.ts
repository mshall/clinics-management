import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { FiscalSubmissionStatus, IntegrationFailureCategory, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { hasAnyRoleInSet } from "../common/effective-roles";
import { parseInsightsRange } from "../common/insights-range";
import { PrismaService } from "../prisma/prisma.service";
import { resolveEtaApiEnvironment } from "./eta-api-environment";
import {
  classifyRejectionRunbookKey,
  type EtaRejectionRunbookKey,
} from "./eta-rejection-runbook";
import {
  computeEtaPilotSuccess,
  ETA_PILOT_SUCCESS_THRESHOLD,
  pilotWeekOneWindow,
  type EtaSubmissionMetricRow,
} from "./eta-pilot-success";

const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const ETA_HEALTH_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
]);

@Injectable()
export class EtaHealthService {
  private readonly log = new Logger(EtaHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertAccess(user: JwtUser, tenantId: string): void {
    if (!user.tenantId || user.tenantId !== tenantId) throw new ForbiddenException();
    if (user.isTenantOwner) return;
    if (user.role && hasAnyRoleInSet(user, ETA_HEALTH_ROLES)) return;
    throw new ForbiddenException("Only organization owners and administrators may view ETA health");
  }

  async getHealth(
    user: JwtUser,
    tenantId: string,
    opts?: { from?: string; to?: string; clinicId?: string },
  ) {
    this.assertAccess(user, tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        etaPilotProductionStartedAt: true,
        etaHealthLastAlertAt: true,
        market: { select: { code: true } },
      },
    });
    if (!tenant) throw new ForbiddenException();

    const pilotWindow = tenant.etaPilotProductionStartedAt
      ? pilotWeekOneWindow(tenant.etaPilotProductionStartedAt)
      : null;
    const { from, to } = parseInsightsRange(
      opts?.from ?? pilotWindow?.from.toISOString(),
      opts?.to ?? pilotWindow?.to.toISOString(),
    );

    const scopeClinicIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const clinicFilter =
      opts?.clinicId?.trim() ?
        { clinicId: opts.clinicId.trim() }
      : scopeClinicIds?.length ?
        { clinicId: { in: scopeClinicIds } }
      : {};

    const submissions = await this.prisma.fiscalSubmission.findMany({
      where: {
        tenantId,
        providerKey: "eta-egypt",
        submittedAt: { gte: from, lte: to },
        ...clinicFilter,
      },
      select: {
        id: true,
        clinicId: true,
        submittedAt: true,
        status: true,
        providerValidationStatus: true,
        idempotencyKey: true,
        errorMessage: true,
      },
      orderBy: { submittedAt: "asc" },
    });

    const metricRows: EtaSubmissionMetricRow[] = submissions.map((s) => ({
      id: s.id,
      clinicId: s.clinicId,
      submittedAt: s.submittedAt,
      status: s.status,
      providerValidationStatus: s.providerValidationStatus,
      idempotencyKey: s.idempotencyKey,
    }));

    const summary = computeEtaPilotSuccess(metricRows);
    const daily = this.dailySeries(submissions, from, to);
    const topRejectionClasses = await this.topRejectionClasses(tenantId, from, to, clinicFilter);

    const clinics = await this.clinicBreakdown(tenantId, metricRows);

    const recentAlert = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        action: "ETA_SUCCESS_BELOW_THRESHOLD",
        createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      threshold: ETA_PILOT_SUCCESS_THRESHOLD,
      etaApiEnvironment: resolveEtaApiEnvironment(),
      marketCode: tenant.market?.code ?? null,
      pilotProductionStartedAt: tenant.etaPilotProductionStartedAt?.toISOString() ?? null,
      period: { from: from.toISOString(), to: to.toISOString() },
      summary,
      daily,
      topRejectionClasses,
      clinics,
      alertActive: Boolean(recentAlert),
      alertLastAt: tenant.etaHealthLastAlertAt?.toISOString() ?? null,
    };
  }

  private dailySeries(
    rows: Array<{ submittedAt: Date | null; providerValidationStatus: string; idempotencyKey: string | null; status: FiscalSubmissionStatus }>,
    from: Date,
    to: Date,
  ) {
    const buckets = new Map<string, EtaSubmissionMetricRow[]>();
    for (const r of rows) {
      if (!r.submittedAt) continue;
      const day = r.submittedAt.toISOString().slice(0, 10);
      const list = buckets.get(day) ?? [];
      list.push({
        id: "",
        clinicId: "",
        submittedAt: r.submittedAt,
        status: r.status,
        providerValidationStatus: r.providerValidationStatus,
        idempotencyKey: r.idempotencyKey,
      });
      buckets.set(day, list);
    }
    const out: { date: string; submittedCount: number; validCount: number; successRate: number | null }[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const sum = computeEtaPilotSuccess(buckets.get(date) ?? []);
      out.push({
        date,
        submittedCount: sum.submittedCount,
        validCount: sum.validCount,
        successRate: sum.successRate,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  private async clinicBreakdown(tenantId: string, rows: EtaSubmissionMetricRow[]) {
    const byClinic = new Map<string, EtaSubmissionMetricRow[]>();
    for (const r of rows) {
      const list = byClinic.get(r.clinicId) ?? [];
      list.push(r);
      byClinic.set(r.clinicId, list);
    }
    const clinicIds = [...byClinic.keys()];
    if (!clinicIds.length) return [];
    const clinics = await this.prisma.clinic.findMany({
      where: { tenantId, id: { in: clinicIds } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    return clinics.map((c) => {
      const sum = computeEtaPilotSuccess(byClinic.get(c.id) ?? []);
      return {
        clinicId: c.id,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        ...sum,
      };
    });
  }

  private async topRejectionClasses(
    tenantId: string,
    from: Date,
    to: Date,
    clinicFilter: Prisma.FiscalSubmissionWhereInput,
  ): Promise<Array<{ key: EtaRejectionRunbookKey; count: number }>> {
    const [fiscalFails, rejected] = await Promise.all([
      this.prisma.integrationFailureLog.findMany({
        where: {
          tenantId,
          category: IntegrationFailureCategory.FISCAL,
          createdAt: { gte: from, lte: to },
        },
        select: { reason: true, statusCode: true },
        take: 500,
      }),
      this.prisma.fiscalSubmission.findMany({
        where: {
          tenantId,
          providerKey: "eta-egypt",
          submittedAt: { gte: from, lte: to },
          status: FiscalSubmissionStatus.REJECTED,
          ...clinicFilter,
        },
        select: { errorMessage: true, providerValidationStatus: true },
        take: 500,
      }),
    ]);

    const counts = new Map<EtaRejectionRunbookKey, number>();
    for (const f of fiscalFails) {
      const key = classifyRejectionRunbookKey({
        errorMessage: f.reason,
        failureClass: f.statusCode === 401 || f.statusCode === 403 ? "credentials" : "permanent",
      });
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const r of rejected) {
      const key = classifyRejectionRunbookKey({
        errorMessage: r.errorMessage,
        providerValidationStatus: r.providerValidationStatus,
        failureClass: "permanent",
      });
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  async maybeAlertDailyForTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        etaHealthLastAlertAt: true,
        etaPilotProductionStartedAt: true,
        market: { select: { code: true } },
      },
    });
    if (!tenant?.market?.code || tenant.market.code !== "EG") return;

    const yesterdayEnd = new Date();
    yesterdayEnd.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = new Date(yesterdayEnd.getTime() - 86_400_000);

    const rows = await this.prisma.fiscalSubmission.findMany({
      where: {
        tenantId,
        providerKey: "eta-egypt",
        submittedAt: { gte: yesterdayStart, lt: yesterdayEnd },
      },
      select: {
        id: true,
        clinicId: true,
        submittedAt: true,
        status: true,
        providerValidationStatus: true,
        idempotencyKey: true,
      },
    });
    const summary = computeEtaPilotSuccess(rows);
    if (summary.submittedCount < 5) return;
    if (summary.successRate !== null && summary.successRate >= ETA_PILOT_SUCCESS_THRESHOLD) return;

    const last = tenant.etaHealthLastAlertAt;
    if (last && Date.now() - last.getTime() < ALERT_COOLDOWN_MS) return;

    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { etaHealthLastAlertAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: null,
          clinicId: null,
          action: "ETA_SUCCESS_BELOW_THRESHOLD",
          resource: "FiscalSubmission",
          resourceId: null,
          metadata: {
            date: yesterdayStart.toISOString().slice(0, 10),
            successRate: summary.successRate,
            submittedCount: summary.submittedCount,
            validCount: summary.validCount,
            threshold: ETA_PILOT_SUCCESS_THRESHOLD,
          },
        },
      }),
    ]);
    this.log.warn(
      `ETA success below threshold for tenant ${tenantId}: ${((summary.successRate ?? 0) * 100).toFixed(1)}%`,
    );
  }

  async markPilotProductionStart(tenantId: string, actorUserId: string | null): Promise<{ startedAt: string }> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { etaPilotProductionStartedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorUserId,
          action: "ETA_PILOT_PRODUCTION_STARTED",
          resource: "Tenant",
          resourceId: tenantId,
          metadata: { startedAt: now.toISOString() },
        },
      }),
    ]);
    return { startedAt: now.toISOString() };
  }
}