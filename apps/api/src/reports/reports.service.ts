import { Injectable } from "@nestjs/common";
import { ExpenseStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
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
}
