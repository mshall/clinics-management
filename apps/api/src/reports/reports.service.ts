import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  AppointmentStatus,
  EncounterStatus,
  ExpenseStatus,
  PatientAcquisitionChannel,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import { formatLocalYmd, resolveLedgerListingRange, resolveReportingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildReportsEncounterWhere,
  buildReportsExpenseWhere,
  buildReportsRevenueWhere,
  mergeCurrencyTotals,
  sumExpensesByCurrency,
  sumRevenueByCurrency,
} from "./reports-aggregation";

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
  constructor(private readonly prisma: PrismaService) {}

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

    const revenueWhere = buildReportsRevenueWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);
    const expenseWhere = buildReportsExpenseWhere(tenantId, start, end, clinicId, scopeClinicIds);
    const encounterWhere = buildReportsEncounterWhere(tenantId, start, end, viewer, clinicId, scopeClinicIds);

    const patientWhere: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
      createdAt: { gte: start, lte: end },
      ...(clinicId ? { homeBranchId: clinicId } : scopeClinicIds?.length ? { homeBranchId: { in: scopeClinicIds } } : {}),
    };

    const appointmentWhere: Prisma.AppointmentWhereInput = {
      tenantId,
      status: AppointmentStatus.COMPLETED,
      startsAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
      ...(viewer?.role === UserRole.PHYSICIAN ? { clinicianId: viewer.userId } : {}),
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
      visits,
      newPatients,
      appointmentsCompleted,
    };
  }

  async clinicBreakdown(tenantId: string, fromStr?: string, toStr?: string, viewer?: JwtUser) {
    if (viewer?.role === UserRole.PHYSICIAN) {
      throw new ForbiddenException("Physicians cannot view organization clinic breakdown");
    }

    const { start, end } = resolveReportingRange(fromStr, toStr);
    const scopeClinicIds = await this.resolveScopeClinicIds(tenantId, viewer);

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

    const [revGrouped, expGrouped, visitGrouped, patientGrouped] = await Promise.all([
      this.prisma.revenueEntry.groupBy({
        by: ["clinicId", "currency"],
        where: revenueWhere,
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
          ...(scopeClinicIds?.length ? { clinicId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.patient.groupBy({
        by: ["homeBranchId"],
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: start, lte: end },
          homeBranchId: { not: null },
          ...(scopeClinicIds?.length ? { homeBranchId: { in: scopeClinicIds } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const revMap = new Map<string, Map<string, number>>();
    for (const row of revGrouped) {
      if (!revMap.has(row.clinicId)) revMap.set(row.clinicId, new Map());
      revMap.get(row.clinicId)!.set(row.currency, Number(row._sum.netAmount ?? 0));
    }

    const expMap = new Map<string, Map<string, number>>();
    for (const row of expGrouped) {
      if (!row.clinicId) continue;
      if (!expMap.has(row.clinicId)) expMap.set(row.clinicId, new Map());
      expMap.get(row.clinicId)!.set(row.currency, Number(row._sum.amount ?? 0));
    }

    const visitsByClinic = new Map(visitGrouped.map((row) => [row.clinicId, row._count._all]));
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
      const byCurrency = mergeCurrencyTotals(revenueByCurrency, expensesByCurrency);
      return {
        clinicId: clinic.id,
        clinicNameEn: clinic.nameEn,
        clinicNameAr: clinic.nameAr,
        defaultCurrency: clinic.defaultCurrency,
        visits: visitsByClinic.get(clinic.id) ?? 0,
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
}
