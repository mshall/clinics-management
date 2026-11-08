import { Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { parseInsightsRange } from "../common/insights-range";
import { PrismaService } from "../prisma/prisma.service";

const MAX_STAFF_ROWS = 500;

@Injectable()
export class AdminInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  private async auditActivitySeries(
    tenantId: string,
    from: Date,
    to: Date,
    scopeClinicIds?: string[],
  ): Promise<{ date: string; count: number }[]> {
    const rows =
      scopeClinicIds?.length ?
        await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
          FROM "AuditLog"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            AND "clinicId" IN (${Prisma.join(scopeClinicIds)})
          GROUP BY 1
          ORDER BY 1 ASC`
      : await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
          FROM "AuditLog"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
          GROUP BY 1
          ORDER BY 1 ASC`;
    return rows.map((r) => ({
      date: (r.day instanceof Date ? r.day : new Date(r.day)).toISOString().slice(0, 10),
      count: Number(r.count),
    }));
  }

  async overview360(tenantId: string, user: JwtUser, fromStr?: string, toStr?: string) {
    const { from, to } = parseInsightsRange(fromStr, toStr);
    const scopeClinicIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const clinicFilter = scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {};

    const [
      auditTotal,
      openTickets,
      patientsCreated,
      encountersCreated,
      appointmentsCreated,
      expensesCreated,
      topActions,
      topResources,
      activitySeries,
    ] = await Promise.all([
      this.prisma.auditLog.count({
        where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter },
      }),
      this.prisma.supportTicket.count({
        where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] } },
      }),
      this.prisma.patient.count({ where: { tenantId, createdAt: { gte: from, lte: to } } }),
      this.prisma.encounter.count({ where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter } }),
      this.prisma.appointment.count({ where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter } }),
      this.prisma.expense.count({ where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter } }),
      this.prisma.auditLog.groupBy({
        by: ["action"],
        where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter },
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["resource"],
        where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter },
        _count: { _all: true },
      }),
      this.auditActivitySeries(tenantId, from, to, scopeClinicIds?.length ? scopeClinicIds : undefined),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      volumes: {
        auditEvents: auditTotal,
        openSupportTickets: openTickets,
        patientsCreated,
        encountersCreated,
        appointmentsCreated,
        expensesCreated,
      },
      topActions: topActions
        .map((a) => ({ action: a.action, count: a._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topResources: topResources
        .map((r) => ({ resource: r.resource, count: r._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      activitySeries,
    };
  }

  async staffPerformance(tenantId: string, user: JwtUser, fromStr?: string, toStr?: string) {
    const { from, to } = parseInsightsRange(fromStr, toStr);
    const scopeClinicIds = await fetchClinicScopeIds(this.prisma, tenantId, user);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(scopeClinicIds?.length
          ? {
              OR: [
                { clinicAdminScopes: { some: { clinicId: { in: scopeClinicIds } } } },
                { role: { in: [UserRole.GROUP_ADMIN, UserRole.GROUP_SUPERVISOR] } },
                { employee: { clinicId: { in: scopeClinicIds } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        deactivatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_STAFF_ROWS,
    });

    const userIds = users.map((u) => u.id);
    if (!userIds.length) return { period: { from: from.toISOString(), to: to.toISOString() }, staff: [] };

    const [auditCounts, encounterCounts, appointmentCounts, operationCounts, openTickets] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ["actorId"],
        where: { tenantId, actorId: { in: userIds }, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.encounter.groupBy({
        by: ["clinicianId"],
        where: {
          tenantId,
          clinicianId: { in: userIds },
          createdAt: { gte: from, lte: to },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ["clinicianId"],
        where: {
          tenantId,
          clinicianId: { in: userIds },
          createdAt: { gte: from, lte: to },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.operation.groupBy({
        by: ["createdByUserId"],
        where: {
          tenantId,
          createdByUserId: { in: userIds },
          createdAt: { gte: from, lte: to },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.supportTicket.groupBy({
        by: ["assigneeUserId"],
        where: {
          tenantId,
          assigneeUserId: { in: userIds },
          status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] },
        },
        _count: { _all: true },
      }),
    ]);

    const auditByUser = new Map(auditCounts.map((a) => [a.actorId ?? "", a._count._all]));
    const encByUser = new Map(encounterCounts.map((a) => [a.clinicianId, a._count._all]));
    const apptByUser = new Map(appointmentCounts.map((a) => [a.clinicianId, a._count._all]));
    const opByUser = new Map(operationCounts.map((a) => [a.createdByUserId ?? "", a._count._all]));
    const ticketsByUser = new Map(openTickets.map((a) => [a.assigneeUserId ?? "", a._count._all]));

    const staff = users.map((u) => {
      const auditActions = auditByUser.get(u.id) ?? 0;
      const encountersCreated = encByUser.get(u.id) ?? 0;
      const appointmentsHandled = apptByUser.get(u.id) ?? 0;
      const operationsCreated = opByUser.get(u.id) ?? 0;
      const openSupportTickets = ticketsByUser.get(u.id) ?? 0;
      return {
        userId: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        active: !u.deactivatedAt,
        metrics: {
          auditActions,
          encountersCreated,
          appointmentsHandled,
          operationsCreated,
          openSupportTickets,
          activityScore: auditActions + encountersCreated * 2 + appointmentsHandled + operationsCreated,
        },
      };
    });

    staff.sort((a, b) => b.metrics.activityScore - a.metrics.activityScore);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      staff,
    };
  }
}
