import { Inject, Injectable } from "@nestjs/common";
import { AppointmentStatus, HomeVisitState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ROUTE_MAPS_PORT, type RouteMapsPort } from "../home-visits/maps/route-maps.port";

/** KNRPT01 — visits done, hours, revenue, travel time, plan completion, missed-visit rate, safety alerts. Aggregates only: no patient data, no addresses. */
@Injectable()
export class NurseReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTE_MAPS_PORT) private readonly maps: RouteMapsPort,
  ) {}

  async summary(tenantId: string, q: { from: Date; to: Date; nurseId?: string }) {
    const visitWhere = { tenantId, plannedStartsAt: { gte: q.from, lt: q.to }, ...(q.nurseId ? { clinicianId: q.nurseId } : {}) };
    const [finished, scheduledTotal, noShows, alerts, plansEnded, plansCompleted] = await Promise.all([
      this.prisma.homeVisit.findMany({ where: { ...visitWhere, state: HomeVisitState.FINISHED }, select: { id: true, clinicianId: true, districtId: true, plannedStartsAt: true, arrivedAt: true, finishedAt: true, appointmentId: true } }),
      this.prisma.homeVisit.count({ where: { ...visitWhere, state: { notIn: [HomeVisitState.CANCELLED] } } }),
      this.prisma.homeVisit.count({ where: { ...visitWhere, state: HomeVisitState.NO_SHOW } }),
      this.prisma.homeSafetyAlert.count({ where: { tenantId, raisedAt: { gte: q.from, lt: q.to } } }),
      this.prisma.carePlan.count({ where: { tenantId, endedAt: { gte: q.from, lt: q.to } } }),
      this.prisma.carePlan.count({ where: { tenantId, endedAt: { gte: q.from, lt: q.to }, dischargeNote: { not: null }, visitsDone: { gt: 0 } } }),
    ]);
    const minutes = finished.reduce((a, v) => a + (v.arrivedAt && v.finishedAt ? Math.max(0, Math.round((v.finishedAt.getTime() - v.arrivedAt.getTime()) / 60000)) : 0), 0);
    const appts = await this.prisma.appointment.aggregate({ where: { tenantId, id: { in: finished.map((v) => v.appointmentId) }, status: AppointmentStatus.COMPLETED }, _sum: { feeAmount: true, homeSurchargeAmount: true } });
    const groups = new Map<string, typeof finished>();
    for (const v of finished) groups.set(`${v.clinicianId}:${v.plannedStartsAt.toISOString().slice(0, 10)}`, [...(groups.get(`${v.clinicianId}:${v.plannedStartsAt.toISOString().slice(0, 10)}`) ?? []), v]);
    let travel = 0;
    for (const g of groups.values()) travel += (await this.maps.legs(g.sort((a, b) => a.plannedStartsAt.getTime() - b.plannedStartsAt.getTime()).map((v) => ({ id: v.id, districtId: v.districtId })))).reduce((a, l) => a + l.travelMinutes, 0);
    return {
      from: q.from.toISOString(),
      to: q.to.toISOString(),
      visitsDone: finished.length,
      hours: Math.round((minutes / 60) * 10) / 10,
      revenue: Number(appts._sum.feeAmount ?? 0).toFixed(2),
      homeSurchargeRevenue: Number(appts._sum.homeSurchargeAmount ?? 0).toFixed(2),
      travelMinutes: travel,
      planCompletionPercent: plansEnded ? Math.round((plansCompleted / plansEnded) * 1000) / 10 : null,
      missedVisitRatePercent: scheduledTotal ? Math.round((noShows / scheduledTotal) * 1000) / 10 : null,
      safetyAlerts: alerts,
    };
  }
}
