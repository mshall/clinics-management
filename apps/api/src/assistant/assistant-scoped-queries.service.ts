import { Injectable } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";

export type AssistantTodaySnapshot = {
  date: string;
  scope: "organization" | "clinic_scope";
  appointmentsToday: number;
  checkedInWaiting: number;
  appointmentsCompleted: number;
  noShows: number;
  encountersFinalizedToday: number;
  openEncounters: number;
  collectedToday: number;
};

export type AssistantEncounterPeriodCount = {
  from: string;
  to: string;
  draftOrAmended: number;
  finalized: number;
};

@Injectable()
export class AssistantScopedQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async scopedClinicIds(tenantId: string, user: JwtUser): Promise<string[] | null> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    return scopeIds;
  }

  async todayOperations(tenantId: string, user: JwtUser): Promise<AssistantTodaySnapshot> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const clinicIds = await this.scopedClinicIds(tenantId, user);
    const clinicClause =
      clinicIds === null ? {} : clinicIds.length ? { clinicId: { in: clinicIds } } : { clinicId: { in: [] } };

    const apptWhere: Prisma.AppointmentWhereInput = {
      tenantId,
      startsAt: { gte: dayStart, lt: dayEnd },
      ...clinicClause,
    };

    const encWhereBase: Prisma.EncounterWhereInput = { tenantId, ...clinicClause };

    const [appointmentsToday, checkedInWaiting, appointmentsCompleted, noShows, encountersFinalizedToday, openEncounters, revenueToday] =
      await Promise.all([
        this.prisma.appointment.count({ where: apptWhere }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            status: AppointmentStatus.CHECKED_IN,
            checkedInAt: { gte: dayStart, lt: dayEnd },
            ...clinicClause,
          },
        }),
        this.prisma.appointment.count({
          where: { ...apptWhere, status: AppointmentStatus.COMPLETED },
        }),
        this.prisma.appointment.count({
          where: { ...apptWhere, noShowAt: { not: null } },
        }),
        this.prisma.encounter.count({
          where: {
            ...encWhereBase,
            status: EncounterStatus.FINALIZED,
            finalizedAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        this.prisma.encounter.count({
          where: {
            ...encWhereBase,
            status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
          },
        }),
        this.prisma.revenueEntry.aggregate({
          where: {
            tenantId,
            status: RevenueStatus.POSTED,
            postedAt: { gte: dayStart, lt: dayEnd },
            ...clinicClause,
          },
          _sum: { netAmount: true },
        }),
      ]);

    return {
      date: dayStart.toISOString().slice(0, 10),
      scope: clinicIds === null ? "organization" : "clinic_scope",
      appointmentsToday,
      checkedInWaiting,
      appointmentsCompleted,
      noShows,
      encountersFinalizedToday,
      openEncounters,
      collectedToday: Number(revenueToday._sum.netAmount ?? 0),
    };
  }

  async encounterCountsForPeriod(
    tenantId: string,
    user: JwtUser,
    start: Date,
    end: Date,
  ): Promise<AssistantEncounterPeriodCount> {
    const clinicIds = await this.scopedClinicIds(tenantId, user);
    const clinicClause =
      clinicIds === null ? {} : clinicIds.length ? { clinicId: { in: clinicIds } } : { clinicId: { in: [] } };

    const periodWhere: Prisma.EncounterWhereInput = {
      tenantId,
      createdAt: { gte: start, lte: end },
      ...clinicClause,
    };

    if (user.role === UserRole.PHYSICIAN) {
      periodWhere.clinicianId = user.userId;
    }

    const [draftOrAmended, finalized] = await Promise.all([
      this.prisma.encounter.count({
        where: {
          ...periodWhere,
          status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
        },
      }),
      this.prisma.encounter.count({
        where: { ...periodWhere, status: EncounterStatus.FINALIZED },
      }),
    ]);

    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      draftOrAmended,
      finalized,
    };
  }
}