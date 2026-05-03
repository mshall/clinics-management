import { Injectable } from "@nestjs/common";
import { EncounterStatus, ExpenseStatus, Prisma, RevenueStatus } from "@prisma/client";
import { formatLocalYmd, resolveReportingRange } from "../common/reporting-range";
import { PrismaService } from "../prisma/prisma.service";

export interface GroupOverviewKpis {
  patients: number;
  encounters30d: number;
  encountersPeriodTotal: number;
  appointmentsPeriodTotal: number;
  revenueMonth: number;
  expensesMonth: number;
  netProfitMonth: number;
  branches: number;
  headcount: number;
  employeeCount: number;
  /** Echo of applied reporting window (ISO date, local boundaries) */
  periodFrom: string;
  periodTo: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async groupOverview(tenantId: string, fromStr?: string, toStr?: string): Promise<GroupOverviewKpis> {
    const { start, end } = resolveReportingRange(fromStr, toStr);

    const [patients, encountersInPeriod, encountersAllInRange, appointmentsInRange, revenueAgg, expenseAgg, branchCount, headcount, employeeCount] =
      await Promise.all([
        this.prisma.patient.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.encounter.count({
          where: {
            tenantId,
            status: EncounterStatus.FINALIZED,
            finalizedAt: { gte: start, lte: end },
          },
        }),
        this.prisma.encounter.count({
          where: { tenantId, createdAt: { gte: start, lte: end } },
        }),
        this.prisma.appointment.count({
          where: { tenantId, startsAt: { gte: start, lte: end } },
        }),
        this.prisma.revenueEntry.aggregate({
          where: {
            tenantId,
            status: RevenueStatus.POSTED,
            postedAt: { gte: start, lte: end },
          },
          _sum: { netAmount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            tenantId,
            status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
            incurredAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),
        this.prisma.clinic.count({ where: { tenantId, parentClinicId: { not: null } } }),
        this.prisma.user.count({ where: { tenantId } }),
        this.safeEmployeeCount(tenantId),
      ]);

    const revenueMonth = Number(revenueAgg._sum.netAmount ?? 0);
    const expensesMonth = Number(expenseAgg._sum.amount ?? 0);

    return {
      patients,
      encounters30d: encountersInPeriod,
      encountersPeriodTotal: encountersAllInRange,
      appointmentsPeriodTotal: appointmentsInRange,
      revenueMonth,
      expensesMonth,
      netProfitMonth: revenueMonth - expensesMonth,
      branches: branchCount,
      headcount,
      employeeCount,
      periodFrom: formatLocalYmd(start),
      periodTo: formatLocalYmd(end),
    };
  }

  private async safeEmployeeCount(tenantId: string): Promise<number> {
    try {
      return await this.prisma.employee.count({ where: { tenantId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
        return 0;
      }
      throw e;
    }
  }
}
