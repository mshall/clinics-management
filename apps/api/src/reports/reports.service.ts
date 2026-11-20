import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  AppointmentStatus,
  EncounterStatus,
  ExpenseStatus,
  OperationStatus,
  PatientAcquisitionChannel,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import { formatLocalYmd, resolveLedgerListingRange, resolveReportingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "../common/effective-roles";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollExpensesService } from "../payroll/payroll-expenses.service";
import {
  buildReportsEncounterWhere,
  buildReportsExpenseWhere,
  buildReportsRevenueWhere,
  mergeCurrencyTotals,
  sumExpensesByCurrency,
  sumRevenueByCurrency,
} from "./reports-aggregation";
import { weightedKiorexRating } from "../marketplace/kiorex-rating";
import {
  bookedMinutes,
  bookingSourceMix,
  newVsReturning,
  noShowRate,
  noShowRateByDay,
  noShowRateByDoctor,
  noShowRateByType,
  revenuePerDoctorHour,
  utilisationPercent,
  type OpsAppointmentRow,
} from "./operations-kpis";
import { bucketAgingLines } from "./ar-aging";

export interface PatientAcquisitionPatientsQuery {
  channel: string;
  from?: string;
  to?: string;
  search?: string;
  mrn?: string;
  name?: string;
  phone?: string;
  branch?: string;
  detail?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollExpenses: PayrollExpensesService,
  ) {}

  private async resolveScopeClinicIds(tenantId: string, viewer?: JwtUser): Promise<string[] | null> {
    if (!viewer) return null;
    return fetchClinicScopeIds(this.prisma, tenantId, viewer);
  }

  private assertClinicInScope(clinicId: string, scopeClinicIds: string[] | null): void {
    if (scopeClinicIds == null) return;
    if (!scopeClinicIds.includes(clinicId)) {
      throw new ForbiddenException("This clinic is outside your assigned scope");
    }
  }

  private async ensurePayrollForRange(
    tenantId: string,
    start: Date,
    end: Date,
    viewer?: JwtUser,
  ): Promise<void> {
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    await this.payrollExpenses.ensureForRange(tenantId, start, end, scopeClinicIds);
  }

  async profitLoss(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    if (clinicId) this.assertClinicInScope(clinicId, scopeClinicIds);
    await this.ensurePayrollForRange(tenantId, start, end, viewer);

    const revenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);
    const expenseWhere = buildReportsExpenseWhere(tenantId, start, end, clinicId, scopeClinicIds);

    const [revenueByCurrency, expensesByCurrency] = await Promise.all([
      sumRevenueByCurrency(this.prisma, revenueWhere),
      sumExpensesByCurrency(this.prisma, expenseWhere),
    ]);
    const byCurrency = mergeCurrencyTotals(revenueByCurrency, expensesByCurrency);
    const revenue = byCurrency.reduce((sum, row) => sum + row.revenue, 0);
    const expenses = byCurrency.reduce((sum, row) => sum + row.expenses, 0);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      clinicId,
      baseCurrency: tenant?.baseCurrency ?? "AED",
      byCurrency,
      revenue,
      expenses,
      netProfit: revenue - expenses,
    };
  }

  async performanceSummary(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    if (clinicId) this.assertClinicInScope(clinicId, scopeClinicIds);
    await this.ensurePayrollForRange(tenantId, start, end, viewer);

    const revenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);
    const expenseWhere = buildReportsExpenseWhere(tenantId, start, end, clinicId, scopeClinicIds);
    const encounterWhere = buildReportsEncounterWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);

    const patientWhere: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
      isSample: false,
      createdAt: { gte: start, lte: end },
      ...(clinicId ? { homeBranchId: clinicId } : scopeClinicIds?.length ? { homeBranchId: { in: scopeClinicIds } } : {}),
    };

    const appointmentWhere: Prisma.AppointmentWhereInput = {
      tenantId,
      patient: { isSample: false },
      status: AppointmentStatus.COMPLETED,
      startsAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
      ...(viewer && hasRole(viewer, UserRole.PHYSICIAN) ? { clinicianId: viewer.userId } : {}),
    };

    const [revenueByCurrency, expensesByCurrency, visits, newPatients, appointmentsCompleted, tenant] =
      await Promise.all([
        sumRevenueByCurrency(this.prisma, revenueWhere),
        sumExpensesByCurrency(this.prisma, expenseWhere),
        this.prisma.encounter.count({ where: encounterWhere }),
        this.prisma.patient.count({ where: patientWhere }),
        this.prisma.appointment.count({ where: appointmentWhere }),
        this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrency: true } }),
      ]);

    const byCurrency = mergeCurrencyTotals(revenueByCurrency, expensesByCurrency);
    const ratings = await this.prisma.kiorexRating.findMany({
      where: {
        tenantId,
        ...(clinicId ? { clinicId } : scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        ...(viewer && hasRole(viewer, UserRole.PHYSICIAN) ? { clinicianId: viewer.userId } : {}),
      },
      select: { averageRating: true, reviewCount: true },
    });

    return {
      kiorexRating: weightedKiorexRating(ratings),
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      clinicId,
      baseCurrency: tenant?.baseCurrency ?? "AED",
      byCurrency,
      visits,
      newPatients,
      appointmentsCompleted,
    };
  }

  async clinicBreakdown(tenantId: string, fromStr?: string, toStr?: string, viewer?: JwtUser) {
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN)) {
      throw new ForbiddenException("Physicians cannot view organization clinic breakdown");
    }

    const { start, end } = resolveReportingRange(fromStr, toStr);
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    await this.ensurePayrollForRange(tenantId, start, end, viewer);

    const clinics = await this.prisma.clinic.findMany({
      where: {
        tenantId,
        ...(scopeClinicIds?.length ? { id: { in: scopeClinicIds } } : {}),
      },
      select: { id: true, nameEn: true, nameAr: true, defaultCurrency: true },
      orderBy: { nameEn: "asc" },
    });

    const revenueWhere: Prisma.RevenueEntryWhereInput = {
      tenantId,
      status: RevenueStatus.POSTED,
      postedAt: { gte: start, lte: end },
      ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      tenantId,
      status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
      incurredAt: { gte: start, lte: end },
      ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
    };

    const operationRevenueWhere: Prisma.RevenueEntryWhereInput = {
      ...revenueWhere,
      OR: [{ operationId: { not: null } }, { category: { in: ["OPERATION", "OPERATION_PAYMENT"] } }],
    };
    const encounterRevenueWhere: Prisma.RevenueEntryWhereInput = {
      ...revenueWhere,
      encounterId: { not: null },
      operationId: null,
      NOT: { category: { in: ["OPERATION", "OPERATION_PAYMENT"] } },
    };
    const otherRevenueWhere: Prisma.RevenueEntryWhereInput = {
      ...revenueWhere,
      encounterId: null,
      operationId: null,
      NOT: { category: { in: ["OPERATION", "OPERATION_PAYMENT"] } },
    };

    const [
      revGrouped,
      encounterRevGrouped,
      operationRevGrouped,
      otherRevGrouped,
      otherRevByCategoryGrouped,
      expGrouped,
      visitGrouped,
      patientGrouped,
      operationGrouped,
      contractOperationGrouped,
    ] = await Promise.all([
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency"],
        where: revenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency"],
        where: encounterRevenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency"],
        where: operationRevenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency"],
        where: otherRevenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency", "category"],
        where: otherRevenueWhere,
        _sum: { netAmount: true },
      }),
      this.prisma.expense.groupBy({
        by: ["clinicId", "currency"],
        where: expenseWhere,
        _sum: { amount: true },
      }),
      this.prisma.encounter.groupBy({
        by: ["clinicId"],
        where: {
          tenantId,
          status: { in: [EncounterStatus.FINALIZED, EncounterStatus.AMENDED] },
          finalizedAt: { gte: start, lte: end },
          patient: { isSample: false },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.patient.groupBy({
        by: ["homeBranchId"],
        where: {
          tenantId,
          deletedAt: null,
          isSample: false,
          createdAt: { gte: start, lte: end },
          homeBranchId: { not: null },
          ...(scopeClinicIds?.length ? { homeBranchId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.operation.groupBy({
        by: ["clinicId"],
        where: {
          tenantId,
          status: { in: [OperationStatus.COMPLETED, OperationStatus.DISCHARGED] },
          operationDate: { gte: start, lte: end },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
        _sum: { paidAmount: true, totalCost: true },
      }),
      this.prisma.operation.groupBy({
        by: ["clinicId"],
        where: {
          tenantId,
          isContract: true,
          status: { in: [OperationStatus.COMPLETED, OperationStatus.DISCHARGED] },
          operationDate: { gte: start, lte: end },
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const revMap = new Map<string, Map<string, number>>();
    for (const row of revGrouped) {
      if (!revMap.has(row.clinicId)) revMap.set(row.clinicId, new Map());
      revMap.get(row.clinicId)!.set(row.currency, Number(row._sum.netAmount ?? 0));
    }

    const toCurrencyMap = (
      rows: { clinicId: string; currency: string; _sum: { netAmount: Prisma.Decimal | null } }[],
    ) => {
      const byClinic = new Map<string, Map<string, number>>();
      for (const row of rows) {
        if (!byClinic.has(row.clinicId)) byClinic.set(row.clinicId, new Map());
        byClinic.get(row.clinicId)!.set(row.currency, Number(row._sum.netAmount ?? 0));
      }
      return byClinic;
    };

    const encounterRevMap = toCurrencyMap(encounterRevGrouped);
    const operationRevMap = toCurrencyMap(operationRevGrouped);
    const otherRevMap = toCurrencyMap(otherRevGrouped);

    const otherBreakdownMap = new Map<string, Map<string, { category: string; amount: number }[]>>();
    for (const row of otherRevByCategoryGrouped) {
      const amount = Number(row._sum.netAmount ?? 0);
      if (amount === 0) continue;
      if (!otherBreakdownMap.has(row.clinicId)) otherBreakdownMap.set(row.clinicId, new Map());
      const byCurrency = otherBreakdownMap.get(row.clinicId)!;
      if (!byCurrency.has(row.currency)) byCurrency.set(row.currency, []);
      byCurrency.get(row.currency)!.push({
        category: row.category?.trim() || "OTHER",
        amount,
      });
    }
    for (const byCurrency of otherBreakdownMap.values()) {
      for (const [currency, rows] of byCurrency) {
        rows.sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
        byCurrency.set(currency, rows);
      }
    }

    const expMap = new Map<string, Map<string, number>>();
    for (const row of expGrouped) {
      if (!row.clinicId) continue;
      if (!expMap.has(row.clinicId)) expMap.set(row.clinicId, new Map());
      expMap.get(row.clinicId)!.set(row.currency, Number(row._sum.amount ?? 0));
    }

    const visitsByClinic = new Map(visitGrouped.map((row) => [row.clinicId, row._count._all]));
    const operationsByClinic = new Map(operationGrouped.map((row) => [row.clinicId, row._count._all]));
    const contractOpsByClinic = new Map(
      contractOperationGrouped.map((row) => [row.clinicId, row._count._all]),
    );
    const operationMoneyByClinic = new Map(
      operationGrouped.map((row) => [
        row.clinicId,
        {
          paidTotal: Number(row._sum.paidAmount ?? 0),
          totalCost: Number(row._sum.totalCost ?? 0),
        },
      ]),
    );
    const patientsByClinic = new Map(
      patientGrouped.filter((row) => row.homeBranchId).map((row) => [row.homeBranchId!, row._count._all]),
    );

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });

    const items = clinics.map((clinic) => {
      const revenueByCurrency = revMap.get(clinic.id) ?? new Map<string, number>();
      const expensesByCurrency = expMap.get(clinic.id) ?? new Map<string, number>();
      const byCurrency = mergeCurrencyTotals(
        revenueByCurrency,
        expensesByCurrency,
        encounterRevMap.get(clinic.id) ?? new Map(),
        operationRevMap.get(clinic.id) ?? new Map(),
        otherRevMap.get(clinic.id) ?? new Map(),
        otherBreakdownMap.get(clinic.id) ?? new Map(),
      );
      const opMoney = operationMoneyByClinic.get(clinic.id);
      return {
        clinicId: clinic.id,
        clinicNameEn: clinic.nameEn,
        clinicNameAr: clinic.nameAr,
        defaultCurrency: clinic.defaultCurrency,
        visits: visitsByClinic.get(clinic.id) ?? 0,
        operationCount: operationsByClinic.get(clinic.id) ?? 0,
        contractOperationCount: contractOpsByClinic.get(clinic.id) ?? 0,
        operationPaidTotal: opMoney?.paidTotal ?? 0,
        operationTotalCost: opMoney?.totalCost ?? 0,
        newPatients: patientsByClinic.get(clinic.id) ?? 0,
        byCurrency,
      };
    });

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      baseCurrency: tenant?.baseCurrency ?? "AED",
      items,
    };
  }

  /**
   * Calendar-month buckets from live data within the reporting range.
   */
  async monthlySeries(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    if (clinicId) this.assertClinicInScope(clinicId, scopeClinicIds);
    await this.ensurePayrollForRange(tenantId, start, end, viewer);

    const startAnchor = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
    const endAnchor = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);

    const buckets: {
      month: string;
      monthStart: string;
      visits: number;
      revenue: number;
      expenses: number;
      newPatients: number;
      revenueByCurrency: { currency: string; amount: number }[];
      expensesByCurrency: { currency: string; amount: number }[];
    }[] = [];

    for (
      let cursor = new Date(startAnchor);
      cursor <= endAnchor;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      const bucketStart = monthStart < start ? start : monthStart;
      const bucketEnd = monthEnd > end ? end : monthEnd;

      const encounterWhere = buildReportsEncounterWhere(
        tenantId,
        bucketStart,
        bucketEnd,
        viewer,
        clinicId,
        scopeClinicIds,
      );
      const revenueWhere = buildReportsRevenueWhere(
        tenantId,
        bucketStart,
        bucketEnd,
        viewer,
        clinicId,
        scopeClinicIds,
      );
      const expenseWhere = buildReportsExpenseWhere(tenantId, bucketStart, bucketEnd, clinicId, scopeClinicIds);

      const patientWhere: Prisma.PatientWhereInput = {
        tenantId,
        deletedAt: null,
        isSample: false,
        createdAt: { gte: bucketStart, lte: bucketEnd },
        ...(clinicId
          ? { homeBranchId: clinicId }
          : scopeClinicIds?.length
            ? { homeBranchId: { in: scopeClinicIds } }
            : {}),
      };

      const [visits, revenueByCurrency, expensesByCurrency, newPatients] = await Promise.all([
        this.prisma.encounter.count({ where: encounterWhere }),
        sumRevenueByCurrency(this.prisma, revenueWhere),
        sumExpensesByCurrency(this.prisma, expenseWhere),
        this.prisma.patient.count({ where: patientWhere }),
      ]);

      const revenueRows = [...revenueByCurrency.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
      const expenseRows = [...expensesByCurrency.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

      buckets.push({
        month: cursor.toLocaleString("en", { month: "short", year: "2-digit" }),
        monthStart: formatLocalYmd(monthStart).slice(0, 7),
        visits,
        revenue: revenueRows.reduce((sum, row) => sum + row.amount, 0),
        expenses: expenseRows.reduce((sum, row) => sum + row.amount, 0),
        newPatients,
        revenueByCurrency: revenueRows,
        expensesByCurrency: expenseRows,
      });
    }

    const currencies = [
      ...new Set(
        buckets.flatMap((b) => [
          ...b.revenueByCurrency.map((r) => r.currency),
          ...b.expensesByCurrency.map((e) => e.currency),
        ]),
      ),
    ].sort((a, b) => a.localeCompare(b));

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      clinicId,
      baseCurrency: tenant?.baseCurrency ?? "AED",
      currencies,
      items: buckets,
    };
  }

  /**
   * Operations money by acquisition channel (how they found us), with optional contract filter.
   */
  async operationAcquisitionRevenue(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    isContractStr?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    if (clinicId) this.assertClinicInScope(clinicId, scopeClinicIds);

    const and: Prisma.OperationWhereInput[] = [
      { tenantId },
      { operationDate: { gte: start, lte: end } },
      { status: { not: OperationStatus.CANCELLED } },
    ];
    if (clinicId) and.push({ clinicId });
    else if (scopeClinicIds?.length) and.push({ clinicId: { in: scopeClinicIds } });
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN)) {
      and.push({ clinicianId: viewer.userId });
    }

    const contractFilter = isContractStr?.trim().toLowerCase();
    if (contractFilter === "true" || contractFilter === "1" || contractFilter === "contract") {
      and.push({ isContract: true });
    } else if (
      contractFilter === "false" ||
      contractFilter === "0" ||
      contractFilter === "standard" ||
      contractFilter === "non_contract"
    ) {
      and.push({ isContract: false });
    }

    const rows = await this.prisma.operation.findMany({
      where: { AND: and },
      select: {
        acquisitionChannel: true,
        isContract: true,
        feeCurrency: true,
        totalCost: true,
        paidAmount: true,
      },
    });

    type MoneyBucket = { currency: string; totalCost: number; paidAmount: number };
    type ChannelAgg = {
      channel: string;
      operationCount: number;
      contractCount: number;
      byCurrency: Map<string, MoneyBucket>;
    };

    const byChannel = new Map<string, ChannelAgg>();
    for (const row of rows) {
      const channel = row.acquisitionChannel ?? "UNKNOWN";
      let agg = byChannel.get(channel);
      if (!agg) {
        agg = { channel, operationCount: 0, contractCount: 0, byCurrency: new Map() };
        byChannel.set(channel, agg);
      }
      agg.operationCount += 1;
      if (row.isContract) agg.contractCount += 1;
      const cur = row.feeCurrency || "EGP";
      const money = agg.byCurrency.get(cur) ?? { currency: cur, totalCost: 0, paidAmount: 0 };
      money.totalCost += Number(row.totalCost);
      money.paidAmount += Number(row.paidAmount);
      agg.byCurrency.set(cur, money);
    }

    const channels = [...Object.values(PatientAcquisitionChannel), "UNKNOWN"] as const;
    const items = channels
      .map((channel) => {
        const agg = byChannel.get(channel);
        if (!agg) return null;
        return {
          channel,
          operationCount: agg.operationCount,
          contractCount: agg.contractCount,
          byCurrency: [...agg.byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.operationCount - a.operationCount);

    const totalOperations = rows.length;
    const totalContract = rows.filter((r) => r.isContract).length;

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      clinicId,
      isContractFilter:
        contractFilter === "true" || contractFilter === "1" || contractFilter === "contract"
          ? true
          : contractFilter === "false" ||
              contractFilter === "0" ||
              contractFilter === "standard" ||
              contractFilter === "non_contract"
            ? false
            : null,
      totalOperations,
      totalContract,
      items,
    };
  }

  /**
   * Encounters (visits) by patient acquisition channel with visit fee paid/total money.
   */
  async encounterAcquisitionRevenue(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    if (clinicId) this.assertClinicInScope(clinicId, scopeClinicIds);

    const and: Prisma.EncounterWhereInput[] = [
      { tenantId },
      { status: { in: [EncounterStatus.FINALIZED, EncounterStatus.AMENDED] } },
      { finalizedAt: { gte: start, lte: end } },
      { patient: { isSample: false, deletedAt: null } },
    ];
    if (clinicId) and.push({ clinicId });
    else if (scopeClinicIds?.length) and.push({ clinicId: { in: scopeClinicIds } });
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN)) {
      and.push({ clinicianId: viewer.userId });
    }

    const rows = await this.prisma.encounter.findMany({
      where: { AND: and },
      select: {
        id: true,
        visitFeeAmount: true,
        visitFeeCurrency: true,
        patient: { select: { acquisitionChannel: true } },
        revenueEntries: {
          where: {
            status: RevenueStatus.POSTED,
            category: { in: ["VISIT_FEE", "VISIT"] },
          },
          select: { netAmount: true, currency: true },
        },
      },
    });

    type MoneyBucket = { currency: string; totalCost: number; paidAmount: number };
    type ChannelAgg = {
      channel: string;
      encounterCount: number;
      byCurrency: Map<string, MoneyBucket>;
    };

    const byChannel = new Map<string, ChannelAgg>();
    for (const row of rows) {
      const channel = row.patient.acquisitionChannel ?? "UNKNOWN";
      let agg = byChannel.get(channel);
      if (!agg) {
        agg = { channel, encounterCount: 0, byCurrency: new Map() };
        byChannel.set(channel, agg);
      }
      agg.encounterCount += 1;

      const feeCurrency = row.visitFeeCurrency || "EGP";
      const total = Number(row.visitFeeAmount);
      const feeBucket =
        agg.byCurrency.get(feeCurrency) ?? { currency: feeCurrency, totalCost: 0, paidAmount: 0 };
      feeBucket.totalCost += total;
      agg.byCurrency.set(feeCurrency, feeBucket);

      for (const rev of row.revenueEntries) {
        const cur = rev.currency || feeCurrency;
        const paidBucket =
          agg.byCurrency.get(cur) ?? { currency: cur, totalCost: 0, paidAmount: 0 };
        paidBucket.paidAmount += Number(rev.netAmount);
        agg.byCurrency.set(cur, paidBucket);
      }
    }

    const channels = [...Object.values(PatientAcquisitionChannel), "UNKNOWN"] as const;
    const items = channels
      .map((channel) => {
        const agg = byChannel.get(channel);
        if (!agg) return null;
        return {
          channel,
          encounterCount: agg.encounterCount,
          byCurrency: [...agg.byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.encounterCount - a.encounterCount);

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      clinicId,
      totalEncounters: rows.length,
      items,
    };
  }

  /**
   * Count new patient registrations by acquisition channel (how they found us) in a date range.
   */
  async patientAcquisitionBreakdown(tenantId: string, fromStr?: string, toStr?: string) {
    const { start, end } = resolveLedgerListingRange(fromStr, toStr);

    let patients: { acquisitionChannel: PatientAcquisitionChannel | null }[];
    try {
      patients = await this.prisma.patient.findMany({
        where: {
          tenantId,
          deletedAt: null,
          isSample: false,
          createdAt: { gte: start, lte: end },
        },
        select: { acquisitionChannel: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2022" || err.code === "P2010")) {
        throw new BadRequestException(
          "Patient acquisition reporting is unavailable until database migrations are applied (acquisitionChannel column).",
        );
      }
      throw err;
    }

    const countByChannel = new Map<string, number>();
    for (const row of patients) {
      const key = row.acquisitionChannel ?? "UNKNOWN";
      countByChannel.set(key, (countByChannel.get(key) ?? 0) + 1);
    }

    const channels = [...Object.values(PatientAcquisitionChannel), "UNKNOWN"] as const;
    const total = patients.length;

    const items = channels
      .map((channel) => {
        const count = countByChannel.get(channel) ?? 0;
        return {
          channel,
          count,
          sharePercent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      period: {
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      total,
      items,
    };
  }

  async patientAcquisitionPatients(tenantId: string, q: PatientAcquisitionPatientsQuery) {
    const channel = q.channel?.trim();
    if (!channel) throw new BadRequestException("channel is required");

    const { start, end } = resolveLedgerListingRange(q.from, q.to);
    const and: Prisma.PatientWhereInput[] = [];

    if (channel === "UNKNOWN") {
      and.push({ acquisitionChannel: null });
    } else if ((Object.values(PatientAcquisitionChannel) as string[]).includes(channel)) {
      and.push({ acquisitionChannel: channel as PatientAcquisitionChannel });
    } else {
      throw new BadRequestException("Invalid acquisition channel");
    }

    const search = q.search?.trim();
    if (search) {
      and.push({
        OR: [
          { mrn: { contains: search, mode: "insensitive" } },
          { firstNameEn: { contains: search, mode: "insensitive" } },
          { lastNameEn: { contains: search, mode: "insensitive" } },
          { firstNameAr: { contains: search, mode: "insensitive" } },
          { lastNameAr: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const mrn = q.mrn?.trim();
    if (mrn) and.push({ mrn: { contains: mrn, mode: "insensitive" } });

    const name = q.name?.trim();
    if (name) {
      and.push({
        OR: [
          { firstNameEn: { contains: name, mode: "insensitive" } },
          { lastNameEn: { contains: name, mode: "insensitive" } },
          { firstNameAr: { contains: name, mode: "insensitive" } },
          { lastNameAr: { contains: name, mode: "insensitive" } },
        ],
      });
    }

    const phone = q.phone?.trim();
    if (phone) and.push({ phone: { contains: phone, mode: "insensitive" } });

    const branch = q.branch?.trim();
    if (branch) {
      and.push({ homeBranch: { is: { nameEn: { contains: branch, mode: "insensitive" } } } });
    }

    const detail = q.detail?.trim();
    if (detail) {
      and.push({
        OR: [
          { acquisitionReferralName: { contains: detail, mode: "insensitive" } },
          { acquisitionOtherDetail: { contains: detail, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
      isSample: false,
      createdAt: { gte: start, lte: end },
      AND: and,
    };

    const { page, pageSize, skip } = parsePageParams(q.page, q.pageSize);
    const sortField = pickSortField(
      q.sortBy,
      ["mrn", "firstNameEn", "lastNameEn", "createdAt", "dob", "phone"] as const,
      "createdAt",
    );
    const sortDir = parseSortOrder(q.sortOrder);

    try {
      const [total, rows] = await Promise.all([
        this.prisma.patient.count({ where }),
        this.prisma.patient.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { [sortField]: sortDir },
          include: { homeBranch: { select: { nameEn: true } } },
        }),
      ]);

      const items = rows.map((p) => {
        const dob = p.dob instanceof Date && !Number.isNaN(p.dob.getTime()) ? p.dob : null;
        return {
          id: p.id,
          mrn: p.mrn,
          firstNameEn: p.firstNameEn,
          lastNameEn: p.lastNameEn,
          firstNameAr: p.firstNameAr,
          lastNameAr: p.lastNameAr,
          phone: p.phone,
          email: p.email,
          dob: dob ? dob.toISOString().slice(0, 10) : null,
          gender: p.gender,
          homeBranch: p.homeBranch?.nameEn ?? null,
          acquisitionChannel: p.acquisitionChannel,
          acquisitionReferralName: p.acquisitionReferralName,
          acquisitionOtherDetail: p.acquisitionOtherDetail,
          createdAt: p.createdAt.toISOString(),
        };
      });

      return paginate(items, total, page, pageSize);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2022" || err.code === "P2010")) {
        throw new BadRequestException(
          "Patient acquisition reporting is unavailable until database migrations are applied (acquisitionChannel column).",
        );
      }
      throw err;
    }
  }

  /** RP-01 — operational KPIs for owners (no-show, utilisation, revenue/hour, sources). */
  async operationsReport(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicId?: string,
    viewer?: JwtUser,
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    const clinicFilter =
      clinicId ? { clinicId } : scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {};

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...clinicFilter,
        startsAt: { gte: start, lte: end },
        patient: { isSample: false },
        ...(viewer && hasRole(viewer, UserRole.PHYSICIAN) ? { clinicianId: viewer.userId } : {}),
      },
      select: {
        id: true,
        status: true,
        clinicianId: true,
        appointmentTypeId: true,
        startsAt: true,
        endsAt: true,
        bookingSource: true,
        isNewPatientAtBooking: true,
        appointmentType: { select: { durationMinutes: true } },
      },
    });

    const rows: OpsAppointmentRow[] = appointments.map((a) => ({
      id: a.id,
      status: a.status,
      clinicianId: a.clinicianId,
      appointmentTypeId: a.appointmentTypeId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      bookingSource: a.bookingSource,
      isNewPatientAtBooking: a.isNewPatientAtBooking,
      durationMinutes: a.appointmentType?.durationMinutes ?? null,
    }));

    const dayMs = 86_400_000;
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs));
    const clinicians = new Set(rows.map((r) => r.clinicianId).filter(Boolean));
    // Available minutes: 8h × distinct clinicians × days in range (template weekJson varies by clinic; owners refine later).
    const available = Math.max(1, clinicians.size) * days * 8 * 60;

    const booked = bookedMinutes(rows);
    const revenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);
    const revenueByCurrency = await sumRevenueByCurrency(this.prisma, revenueWhere);
    let revenueTotal = 0;
    for (const v of revenueByCurrency.values()) revenueTotal += v;

    return {
      period: { from: formatLocalYmd(start), to: formatLocalYmd(end), start: start.toISOString(), end: end.toISOString() },
      clinicId: clinicId ?? null,
      noShow: noShowRate(rows),
      noShowByDoctor: noShowRateByDoctor(rows),
      noShowByType: noShowRateByType(rows),
      noShowByDay: noShowRateByDay(rows),
      utilisation: {
        bookedMinutes: booked,
        availableMinutes: available,
        percent: utilisationPercent(booked, available),
      },
      revenuePerDoctorHour: revenuePerDoctorHour(revenueTotal, booked),
      revenueTotal,
      newVsReturning: newVsReturning(rows),
      bookingSources: bookingSourceMix(rows),
      appointmentCount: rows.length,
      availableMinutesSource: "clinician_day_fallback",
    };
  }

  /** RP-04 — AR aging buckets per payer from open claim lines (reconciles to ClaimLine amounts). */
  async arAging(tenantId: string, asOfStr?: string, viewer?: JwtUser) {
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN) && !hasRole(viewer, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Physicians cannot view AR aging");
    }
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new BadRequestException("Invalid asOf date");

    const openLines = await this.prisma.claimLine.findMany({
      where: {
        tenantId,
        status: { in: ["SUBMITTED", "ACCEPTED", "PENDING", "RESUBMITTED"] },
      },
      include: {
        batch: { select: { payerCompanyId: true, currency: true } },
        invoice: { select: { issueDate: true, invoiceNumber: true } },
      },
    });

    const byPayer = new Map<
      string,
      { payerCompanyId: string; currency: string; lines: { amountOpen: number; issuedAt: Date }[] }
    >();
    for (const line of openLines) {
      const payerCompanyId = line.batch.payerCompanyId;
      const currency = line.batch.currency;
      const key = `${payerCompanyId}:${currency}`;
      const row = byPayer.get(key) ?? { payerCompanyId, currency, lines: [] };
      const open = Number(line.amountClaimed) - Number(line.amountPaid ?? 0);
      if (open <= 0) continue;
      row.lines.push({ amountOpen: open, issuedAt: line.invoice.issueDate });
      byPayer.set(key, row);
    }

    const payers = await this.prisma.payerCompany.findMany({
      where: { tenantId, id: { in: [...new Set([...byPayer.values()].map((p) => p.payerCompanyId))] } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    const nameById = new Map(payers.map((p) => [p.id, p]));

    const rows = [...byPayer.values()].map((p) => {
      const { buckets, total } = bucketAgingLines(
        p.lines.map((l) => ({ amountOpen: l.amountOpen, asOf, issuedAt: l.issuedAt })),
        asOf,
      );
      const names = nameById.get(p.payerCompanyId);
      return {
        payerCompanyId: p.payerCompanyId,
        payerNameEn: names?.nameEn ?? p.payerCompanyId,
        payerNameAr: names?.nameAr ?? "",
        currency: p.currency,
        buckets,
        total,
        lineCount: p.lines.length,
      };
    });

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    const openClaimSum = openLines.reduce((s, l) => {
      const open = Number(l.amountClaimed) - Number(l.amountPaid ?? 0);
      return s + (open > 0 ? open : 0);
    }, 0);

    return {
      asOf: asOf.toISOString(),
      rows,
      grandTotal,
      reconcilesWithClaimLines: Math.abs(grandTotal - openClaimSum) < 0.005,
      openClaimLineTotal: openClaimSum,
    };
  }

  /** RP-04 — payout tracking (Kiorex payouts + doctor statement payouts). */
  async payouts(tenantId: string, fromStr?: string, toStr?: string, viewer?: JwtUser) {
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN) && !hasRole(viewer, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Physicians cannot view payouts report");
    }
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const kiorex = await this.prisma.kiorexPayout.findMany({
      where: { tenantId, paidAt: { gte: start, lte: end } },
      orderBy: { paidAt: "desc" },
      take: 200,
    });
    const statements = await this.prisma.doctorStatement.findMany({
      where: { tenantId, status: "PAID", paidAt: { gte: start, lte: end } },
      select: {
        id: true,
        clinicianId: true,
        periodKey: true,
        currency: true,
        totalsJson: true,
        paidAt: true,
        payoutsJson: true,
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    });
    const doctorShareOf = (totalsJson: unknown) => {
      const t = totalsJson as { doctorShare?: number; netPayable?: number } | null;
      return Number(t?.netPayable ?? t?.doctorShare ?? 0);
    };
    const kiorexTotal = kiorex.reduce((s, p) => s + Number(p.amount), 0);
    const doctorTotal = statements.reduce((s, st) => s + doctorShareOf(st.totalsJson), 0);
    return {
      period: { from: formatLocalYmd(start), to: formatLocalYmd(end) },
      kiorexPayouts: kiorex.map((p) => ({
        id: p.id,
        payoutRef: p.payoutRef,
        amount: Number(p.amount),
        currency: p.currency,
        paidAt: p.paidAt?.toISOString() ?? null,
        clinicId: p.clinicId,
      })),
      doctorPayouts: statements.map((st) => ({
        id: st.id,
        clinicianId: st.clinicianId,
        periodKey: st.periodKey,
        amount: doctorShareOf(st.totalsJson),
        currency: st.currency,
        paidAt: st.paidAt?.toISOString() ?? null,
        payoutsJson: st.payoutsJson,
      })),
      totals: { kiorex: kiorexTotal, doctor: doctorTotal, combined: kiorexTotal + doctorTotal },
    };
  }

  /** RP-04 — branch P&L: per-clinic profit/loss that reconciles to revenue + expense tables. */
  async branchPl(tenantId: string, fromStr?: string, toStr?: string, viewer?: JwtUser) {
    if (viewer && hasRole(viewer, UserRole.PHYSICIAN) && !hasRole(viewer, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Physicians cannot view branch P&L");
    }
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);
    await this.ensurePayrollForRange(tenantId, start, end, viewer);

    const clinics = await this.prisma.clinic.findMany({
      where: {
        tenantId,
        ...(scopeClinicIds?.length ? { id: { in: scopeClinicIds } } : {}),
      },
      select: { id: true, nameEn: true, nameAr: true, defaultCurrency: true },
      orderBy: { nameEn: "asc" },
    });

    const branches = [];
    let revenueSum = 0;
    let expenseSum = 0;
    for (const clinic of clinics) {
      const revenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, clinic.id, scopeClinicIds);
      const expenseWhere = buildReportsExpenseWhere(tenantId, start, end, clinic.id, scopeClinicIds);
      const [revMap, expMap] = await Promise.all([
        sumRevenueByCurrency(this.prisma, revenueWhere),
        sumExpensesByCurrency(this.prisma, expenseWhere),
      ]);
      let revenue = 0;
      let expenses = 0;
      for (const v of revMap.values()) revenue += v;
      for (const v of expMap.values()) expenses += v;
      revenueSum += revenue;
      expenseSum += expenses;
      branches.push({
        clinicId: clinic.id,
        nameEn: clinic.nameEn,
        nameAr: clinic.nameAr,
        currency: clinic.defaultCurrency,
        revenue,
        expenses,
        netProfit: revenue - expenses,
      });
    }

    const orgRevenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, null, scopeClinicIds);
    const orgExpenseWhere = buildReportsExpenseWhere(tenantId, start, end, null, scopeClinicIds);
    const [orgRev, orgExp] = await Promise.all([
      sumRevenueByCurrency(this.prisma, orgRevenueWhere),
      sumExpensesByCurrency(this.prisma, orgExpenseWhere),
    ]);
    let orgRevenue = 0;
    let orgExpenses = 0;
    for (const v of orgRev.values()) orgRevenue += v;
    for (const v of orgExp.values()) orgExpenses += v;

    return {
      period: { from: formatLocalYmd(start), to: formatLocalYmd(end) },
      branches,
      totals: { revenue: revenueSum, expenses: expenseSum, netProfit: revenueSum - expenseSum },
      reconcilesWithBilling:
        Math.abs(revenueSum - orgRevenue) < 0.005 && Math.abs(expenseSum - orgExpenses) < 0.005,
      billingTotals: { revenue: orgRevenue, expenses: orgExpenses },
    };
  }
}
