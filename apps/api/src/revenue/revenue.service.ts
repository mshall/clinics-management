import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, RevenueStatus, UserRole } from "@prisma/client";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { fetchClinicScopeIds, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { resolveLedgerListingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRevenueDto } from "./dto/create-revenue.dto";
import type { RevenueEntryDto } from "./dto/revenue.dto";
import type { RevenueTotalsDto } from "./dto/revenue-totals.dto";

const LEDGER_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
  UserRole.PHYSICIAN,
]);

const POST_REVENUE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
]);

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  private assertLedgerAccess(role: UserRole): void {
    if (!LEDGER_ROLES.has(role)) {
      throw new ForbiddenException("You may not view the revenue ledger");
    }
  }

  private assertPostRevenue(role: UserRole): void {
    if (!POST_REVENUE_ROLES.has(role)) {
      throw new ForbiddenException("You may not post revenue entries");
    }
  }

  private map(r: {
    id: string;
    clinicId: string;
    clinic?: { nameEn: string; nameAr: string } | null;
    category: string;
    description: string | null;
    grossAmount: { toString(): string };
    taxAmount: { toString(): string };
    netAmount: { toString(): string };
    currency: string;
    postedAt: Date;
    status: RevenueStatus;
  }): RevenueEntryDto {
    return {
      id: r.id,
      clinicId: r.clinicId,
      clinicNameEn: r.clinic?.nameEn ?? null,
      clinicNameAr: r.clinic?.nameAr ?? null,
      category: r.category,
      description: r.description,
      grossAmount: Number(r.grossAmount),
      taxAmount: Number(r.taxAmount),
      netAmount: Number(r.netAmount),
      currency: r.currency,
      postedAt: r.postedAt.toISOString(),
      status: r.status,
    };
  }

  async list(
    tenantId: string,
    fromStr: string | undefined,
    toStr: string | undefined,
    pageStr: string | undefined,
    pageSizeStr: string | undefined,
    clinicIdStr: string | undefined,
    sortByStr: string | undefined,
    sortOrderStr: string | undefined,
    clinicianUserId: string | undefined,
    user: JwtUser
  ) {
    this.assertLedgerAccess(user.role);
    const { start, end } = resolveLedgerListingRange(fromStr, toStr);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const clinicId = clinicIdStr?.trim();

    let clinicScope: Prisma.RevenueEntryWhereInput = {};
    if (user.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, user.userId);
      if (!net.length) {
        return paginate([], 0, page, pageSize);
      }
      if (clinicId) {
        if (!net.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        clinicScope = { clinicId };
      } else {
        clinicScope = { clinicId: { in: net } };
      }
    } else {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
      if (scopeIds !== null) {
        if (!scopeIds.length) {
          return paginate([], 0, page, pageSize);
        }
        if (clinicId) {
          if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
          clinicScope = { clinicId };
        } else {
          clinicScope = { clinicId: { in: scopeIds } };
        }
      } else if (clinicId) {
        clinicScope = { clinicId };
      }
    }

    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...clinicScope,
      ...(clinicianUserId
        ? {
            encounterId: { not: null },
            encounter: { is: { clinicianId: clinicianUserId } },
          }
        : {}),
    };
    const sortField = pickSortField(sortByStr, ["postedAt", "netAmount", "category", "status", "grossAmount"] as const, "postedAt");
    const sortDir = parseSortOrder(sortOrderStr);
    const [total, rows] = await Promise.all([
      this.prisma.revenueEntry.count({ where }),
      this.prisma.revenueEntry.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: { clinic: { select: { nameEn: true, nameAr: true } } },
      }),
    ]);
    return paginate(rows.map((row) => this.map(row)), total, page, pageSize);
  }

  async totals(
    tenantId: string,
    fromStr: string | undefined,
    toStr: string | undefined,
    clinicIdStr: string | undefined,
    clinicianUserId: string | undefined,
    user: JwtUser
  ): Promise<RevenueTotalsDto> {
    this.assertLedgerAccess(user.role);
    const { start, end } = resolveLedgerListingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim();

    let clinicScope: Prisma.RevenueEntryWhereInput = {};
    if (user.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, user.userId);
      if (!net.length) {
        return { grossTotal: 0, netTotal: 0 };
      }
      if (clinicId) {
        if (!net.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        clinicScope = { clinicId };
      } else {
        clinicScope = { clinicId: { in: net } };
      }
    } else {
      const scopeIdsTot = await fetchClinicScopeIds(this.prisma, tenantId, user);
      if (scopeIdsTot !== null) {
        if (!scopeIdsTot.length) {
          return { grossTotal: 0, netTotal: 0 };
        }
        if (clinicId) {
          if (!scopeIdsTot.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
          clinicScope = { clinicId };
        } else {
          clinicScope = { clinicId: { in: scopeIdsTot } };
        }
      } else if (clinicId) {
        clinicScope = { clinicId };
      }
    }

    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...clinicScope,
      ...(clinicianUserId
        ? {
            encounterId: { not: null },
            encounter: { is: { clinicianId: clinicianUserId } },
          }
        : {}),
    };
    const agg = await this.prisma.revenueEntry.aggregate({
      where,
      _sum: { grossAmount: true, netAmount: true },
    });
    return {
      grossTotal: Number(agg._sum.grossAmount ?? 0),
      netTotal: Number(agg._sum.netAmount ?? 0),
    };
  }

  async create(tenantId: string, dto: CreateRevenueDto, user: JwtUser): Promise<RevenueEntryDto> {
    this.assertPostRevenue(user.role);
    const scopeIdsCreate = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIdsCreate !== null && !scopeIdsCreate.includes(dto.clinicId)) {
      throw new ForbiddenException("Clinic is outside your assigned scope");
    }
    const clinic = await this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } });
    if (!clinic) throw new BadRequestException("Invalid clinicId");
    const row = await this.prisma.revenueEntry.create({
      data: {
        tenantId,
        clinicId: dto.clinicId,
        category: dto.category,
        description: dto.description ?? null,
        grossAmount: dto.grossAmount,
        taxAmount: dto.taxAmount,
        netAmount: dto.netAmount,
        currency: dto.currency,
        postedAt: new Date(dto.postedAt),
        status: dto.status ?? RevenueStatus.POSTED,
      },
      include: { clinic: { select: { nameEn: true, nameAr: true } } },
    });
    return this.map(row);
  }

  async clinicBreakdown(tenantId: string, fromStr: string | undefined, toStr: string | undefined, user: JwtUser) {
    if (user.role !== UserRole.GROUP_ADMIN && user.role !== UserRole.CLINIC_ADMIN && user.role !== UserRole.BRANCH_MANAGER) {
      throw new ForbiddenException("Only administrators may view clinic revenue breakdown");
    }
    const { start, end } = resolveLedgerListingRange(fromStr, toStr);
    let scopeClinicIds: string[] | null = null;
    const bdScope = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (bdScope !== null) {
      scopeClinicIds = bdScope;
      if (!scopeClinicIds.length) {
        return { items: [] as { clinicId: string; nameEn: string; nameAr: string; grossTotal: number; netTotal: number; taxTotal: number }[], grandGross: 0, grandNet: 0 };
      }
    }
    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      status: RevenueStatus.POSTED,
      postedAt: { gte: start, lte: end },
      ...(scopeClinicIds ? { clinicId: { in: scopeClinicIds } } : {}),
    };
    const grouped = await this.prisma.revenueEntry.groupBy({
      by: ["clinicId"],
      where,
      _sum: { grossAmount: true, netAmount: true, taxAmount: true },
    });
    const ids = grouped.map((g) => g.clinicId);
    const clinics = await this.prisma.clinic.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    const nameBy = new Map(clinics.map((c) => [c.id, c] as const));
    const items = grouped.map((g) => {
      const c = nameBy.get(g.clinicId);
      return {
        clinicId: g.clinicId,
        nameEn: c?.nameEn ?? g.clinicId,
        nameAr: c?.nameAr ?? "",
        grossTotal: Number(g._sum.grossAmount ?? 0),
        netTotal: Number(g._sum.netAmount ?? 0),
        taxTotal: Number(g._sum.taxAmount ?? 0),
      };
    });
    const grandGross = items.reduce((a, i) => a + i.grossTotal, 0);
    const grandNet = items.reduce((a, i) => a + i.netTotal, 0);
    return { items, grandGross, grandNet };
  }
}
