import { Injectable } from "@nestjs/common";
import { EncounterStatus, ExpenseStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
import { formatLocalYmd, resolveReportingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async profitLoss(tenantId: string, fromStr?: string, toStr?: string, viewer?: JwtUser) {
    const { start, end } = resolveReportingRange(fromStr, toStr);

    const revenueWhere: Prisma.RevenueEntryWhereInput = {
      tenantId,
      status: RevenueStatus.POSTED,
      postedAt: { gte: start, lte: end },
      ...(viewer?.role === UserRole.PHYSICIAN
        ? {
            encounterId: { not: null },
            encounter: { is: { clinicianId: viewer.userId } },
          }
        : {}),
    };

    const [rev, exp] = await Promise.all([
      this.prisma.revenueEntry.aggregate({
        where: revenueWhere,
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
    ]);

    const revenue = Number(rev._sum.netAmount ?? 0);
    const expenses = Number(exp._sum.amount ?? 0);
    const netProfit = revenue - expenses;

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      revenue,
      expenses,
      netProfit,
    };
  }

  /**
   * Calendar-month buckets from live data: finalized visits, posted revenue, new patients.
   */
  async monthlySeries(tenantId: string, monthsRaw: string | undefined, viewer?: JwtUser) {
    const parsed = Number.parseInt(monthsRaw ?? "12", 10);
    const monthCount = Number.isFinite(parsed) ? Math.min(36, Math.max(3, parsed)) : 12;

    const now = new Date();
    const startAnchor = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1, 0, 0, 0, 0);

    const buckets: {
      month: string;
      monthStart: string;
      visits: number;
      revenue: number;
      newPatients: number;
    }[] = [];

    for (let i = 0; i < monthCount; i++) {
      const d = new Date(startAnchor.getFullYear(), startAnchor.getMonth() + i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

      const encounterWhere: Prisma.EncounterWhereInput = {
        tenantId,
        status: { in: [EncounterStatus.FINALIZED, EncounterStatus.AMENDED] },
        finalizedAt: { gte: monthStart, lte: monthEnd },
        ...(viewer?.role === UserRole.PHYSICIAN ? { clinicianId: viewer.userId } : {}),
      };

      const revenueWhere: Prisma.RevenueEntryWhereInput = {
        tenantId,
        status: RevenueStatus.POSTED,
        postedAt: { gte: monthStart, lte: monthEnd },
        ...(viewer?.role === UserRole.PHYSICIAN
          ? {
              encounterId: { not: null },
              encounter: { is: { clinicianId: viewer.userId } },
            }
          : {}),
      };

      const [visits, revAgg, newPatients] = await Promise.all([
        this.prisma.encounter.count({ where: encounterWhere }),
        this.prisma.revenueEntry.aggregate({
          where: revenueWhere,
          _sum: { netAmount: true },
        }),
        this.prisma.patient.count({
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      buckets.push({
        month: d.toLocaleString("en", { month: "short", year: "2-digit" }),
        monthStart: formatLocalYmd(monthStart).slice(0, 7),
        visits,
        revenue: Number(revAgg._sum.netAmount ?? 0),
        newPatients,
      });
    }

    return { months: monthCount, items: buckets };
  }
}
