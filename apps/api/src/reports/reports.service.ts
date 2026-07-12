import { BadRequestException, Injectable } from "@nestjs/common";
import {
  EncounterStatus,
  ExpenseStatus,
  PatientAcquisitionChannel,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import { formatLocalYmd, resolveLedgerListingRange, resolveReportingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

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
   * Calendar-month buckets from live data: finalized visits, posted revenue, expenses, new patients.
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
      expenses: number;
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

      const [visits, revAgg, expAgg, newPatients] = await Promise.all([
        this.prisma.encounter.count({ where: encounterWhere }),
        this.prisma.revenueEntry.aggregate({
          where: revenueWhere,
          _sum: { netAmount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            tenantId,
            status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
            incurredAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
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
        expenses: Number(expAgg._sum.amount ?? 0),
        newPatients,
      });
    }

    return { months: monthCount, items: buckets };
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
