import { Injectable } from "@nestjs/common";
import { ClinicRecordStatus, EncounterStatus, ExpenseStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
import { formatLocalYmd, resolveReportingRange } from "../common/reporting-range";
import { PayrollExpensesService } from "../payroll/payroll-expenses.service";
import { PrismaService } from "../prisma/prisma.service";
import { canViewDashboardFinancialKpis, canViewDashboardHrKpis } from "./dashboard-kpi-policy";

export interface GroupOverviewKpis {
  patients: number;
  encounters30d: number;
  encountersPeriodTotal: number;
  appointmentsPeriodTotal: number;
  revenueMonth: number;
  expensesMonth: number;
  netProfitMonth: number;
  revenueByCurrency: { currency: string; amount: number }[];
  expensesByCurrency: { currency: string; amount: number }[];
  branches: number;
  headcount: number;
  employeeCount: number;
  periodFrom: string;
  periodTo: string;
}

function mapCurrencyTotals(
  rows: { currency: string; _sum: { netAmount?: Prisma.Decimal | null; amount?: Prisma.Decimal | null } }[],
  field: "netAmount" | "amount",
): { currency: string; amount: number }[] {
  return rows
    .map((row) => ({
      currency: row.currency,
      amount: Number(row._sum[field] ?? 0),
    }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollExpenses: PayrollExpensesService,
  ) {}

  async groupOverview(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    viewerRole?: UserRole,
  ): Promise<GroupOverviewKpis> {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    await this.payrollExpenses.ensureForRange(tenantId, start, end, null);

    const revenueWhere: Prisma.RevenueEntryWhereInput = {
      tenantId,
      status: RevenueStatus.POSTED,
      postedAt: { gte: start, lte: end },
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      tenantId,
      status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
      incurredAt: { gte: start, lte: end },
    };

    const [
      patients,
      encountersInPeriod,
      encountersAllInRange,
      appointmentsInRange,
      revenueByCurrencyRows,
      expensesByCurrencyRows,
      branchCount,
      headcount,
      employeeCount,
    ] = await Promise.all([
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
      this.prisma.revenueEntry.groupBy({
        by: ["currency"],
        where: revenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.expense.groupBy({
        by: ["currency"],
        where: expenseWhere,
        _sum: { amount: true },
      }),
      this.prisma.clinic.count({
        where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE },
      }),
      this.prisma.user.count({ where: { tenantId } }),
      this.safeEmployeeCount(tenantId),
    ]);

    const revenueByCurrency = mapCurrencyTotals(revenueByCurrencyRows, "netAmount");
    const expensesByCurrency = mapCurrencyTotals(expensesByCurrencyRows, "amount");
    const revenueMonth = revenueByCurrency.reduce((sum, row) => sum + row.amount, 0);
    const expensesMonth = expensesByCurrency.reduce((sum, row) => sum + row.amount, 0);

    const showFinancial = viewerRole == null || canViewDashboardFinancialKpis(viewerRole);
    const showHr = viewerRole == null || canViewDashboardHrKpis(viewerRole);

    return {
      patients,
      encounters30d: encountersInPeriod,
      encountersPeriodTotal: encountersAllInRange,
      appointmentsPeriodTotal: appointmentsInRange,
      revenueMonth: showFinancial ? revenueMonth : 0,
      expensesMonth: showFinancial ? expensesMonth : 0,
      netProfitMonth: showFinancial ? revenueMonth - expensesMonth : 0,
      revenueByCurrency: showFinancial ? revenueByCurrency : [],
      expensesByCurrency: showFinancial ? expensesByCurrency : [],
      branches: branchCount,
      headcount: showHr ? headcount : 0,
      employeeCount: showHr ? employeeCount : 0,
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
