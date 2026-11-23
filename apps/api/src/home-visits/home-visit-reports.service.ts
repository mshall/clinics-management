import { Inject, Injectable } from "@nestjs/common";
import { AppointmentStatus, HomeVisitState, ServiceLocation } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ROUTE_MAPS_PORT, type RouteMapsPort } from "./maps/route-maps.port";

/** HVRPT01 — in-clinic vs home: visits, revenue, travel time, cancellations. District-level only (no addresses). */
@Injectable()
export class HomeVisitReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTE_MAPS_PORT) private readonly maps: RouteMapsPort,
  ) {}

  async split(tenantId: string, q: { from: Date; to: Date; clinicId?: string }) {
    const where = { tenantId, startsAt: { gte: q.from, lt: q.to }, ...(q.clinicId ? { clinicId: q.clinicId } : {}) };
    const rows = await this.prisma.appointment.groupBy({
      by: ["serviceLocation", "status"],
      where,
      _count: { _all: true },
      _sum: { feeAmount: true, homeSurchargeAmount: true },
    });
    const empty = () => ({ visits: 0, revenue: "0.00", homeSurchargeRevenue: "0.00", cancellations: 0, noShows: 0 });
    const out: Record<"IN_CLINIC" | "HOME", ReturnType<typeof empty> & { travelMinutes?: number }> = { IN_CLINIC: empty(), HOME: empty() };
    const money = { IN_CLINIC: [0, 0], HOME: [0, 0] } as Record<string, [number, number]>;
    for (const r of rows) {
      // ADR-039: telehealth (VIDEO) is not a home visit; the home-vs-clinic split counts it with the non-home bucket.
      const loc = r.serviceLocation === "HOME" ? "HOME" : "IN_CLINIC";
      const bucket = out[loc];
      if (r.status === AppointmentStatus.COMPLETED) {
        bucket.visits += r._count._all;
        money[loc]![0] += Number(r._sum.feeAmount ?? 0);
        money[loc]![1] += Number(r._sum.homeSurchargeAmount ?? 0);
      }
      if (r.status === AppointmentStatus.CANCELLED) bucket.cancellations += r._count._all;
      if (r.status === AppointmentStatus.NO_SHOW) bucket.noShows += r._count._all;
    }
    for (const k of ["IN_CLINIC", "HOME"] as const) {
      out[k].revenue = money[k]![0].toFixed(2);
      out[k].homeSurchargeRevenue = money[k]![1].toFixed(2);
    }
    out.HOME.travelMinutes = await this.travelMinutes(tenantId, q);
    const full = await this.geostampCoverage(tenantId, q);
    return { from: q.from.toISOString(), to: q.to.toISOString(), ...out, geostampTrailCompletePercent: full };
  }

  /** Sum of modelled travel between consecutive same-day visits per clinician (mock matrix now; Amazon Location when real). */
  private async travelMinutes(tenantId: string, q: { from: Date; to: Date; clinicId?: string }): Promise<number> {
    const visits = await this.prisma.homeVisit.findMany({
      where: { tenantId, plannedStartsAt: { gte: q.from, lt: q.to }, state: { in: [HomeVisitState.FINISHED, HomeVisitState.ARRIVED] }, ...(q.clinicId ? { clinicId: q.clinicId } : {}) },
      select: { id: true, clinicianId: true, districtId: true, plannedStartsAt: true },
      orderBy: { plannedStartsAt: "asc" },
    });
    const groups = new Map<string, typeof visits>();
    for (const v of visits) {
      const key = `${v.clinicianId}:${v.plannedStartsAt.toISOString().slice(0, 10)}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    let total = 0;
    for (const g of groups.values()) total += this.maps.legs(g.map((v) => ({ id: v.id, districtId: v.districtId }))).reduce((a, l) => a + l.travelMinutes, 0);
    return total;
  }

  /** Success metric "home visits with full geostamp trail >= 98%": share of FINISHED visits that have ON_MY_WAY + ARRIVED + FINISHED stamps. */
  private async geostampCoverage(tenantId: string, q: { from: Date; to: Date; clinicId?: string }): Promise<number | null> {
    const finished = await this.prisma.homeVisit.findMany({
      where: { tenantId, state: HomeVisitState.FINISHED, plannedStartsAt: { gte: q.from, lt: q.to }, ...(q.clinicId ? { clinicId: q.clinicId } : {}) },
      select: { geostamps: { select: { kind: true } } },
    });
    if (!finished.length) return null;
    const full = finished.filter((v) => ["ON_MY_WAY", "ARRIVED", "FINISHED"].every((k) => v.geostamps.some((g) => g.kind === k))).length;
    return Math.round((full / finished.length) * 1000) / 10;
  }
}
