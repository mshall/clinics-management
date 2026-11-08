import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

@Injectable()
export class AdminInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview360(tenantId: string, user: JwtUser, fromStr?: string, toStr?: string) {
    const { from, to } = parseRange(fromStr, toStr);
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
      auditByDay,
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
      this.prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: from, lte: to }, ...clinicFilter },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const dayMap = new Map<string, number>();
    for (const row of auditByDay) {
      const key = row.createdAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const activitySeries = [...dayMap.entries()].map(([date, count]) => ({ date, count }));

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
    const { from, to } = parseRange(fromStr, toStr);
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
      take: 200,
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
