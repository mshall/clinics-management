import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, RevenueStatus, UserRole } from "@prisma/client";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { resolveReportingRange } from "../common/reporting-range";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRevenueDto } from "./dto/create-revenue.dto";
import type { RevenueEntryDto } from "./dto/revenue.dto";
import type { RevenueTotalsDto } from "./dto/revenue-totals.dto";

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  private map(r: {
    id: string;
    clinicId: string;
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
    fromStr?: string,
    toStr?: string,
    pageStr?: string,
    pageSizeStr?: string,
    clinicIdStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    clinicianUserId?: string
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const clinicId = clinicIdStr?.trim();
    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : {}),
      ...(clinicianUserId ? { encounter: { is: { clinicianId: clinicianUserId } } } : {}),
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
      }),
    ]);
    return paginate(rows.map((row) => this.map(row)), total, page, pageSize);
  }

  async totals(tenantId: string, fromStr?: string, toStr?: string, clinicIdStr?: string, clinicianUserId?: string): Promise<RevenueTotalsDto> {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim();
    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : {}),
      ...(clinicianUserId ? { encounter: { is: { clinicianId: clinicianUserId } } } : {}),
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

  async create(tenantId: string, dto: CreateRevenueDto): Promise<RevenueEntryDto> {
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
    });
    return this.map(row);
  }

  async clinicBreakdown(tenantId: string, fromStr: string | undefined, toStr: string | undefined, user: JwtUser) {
    if (user.role !== UserRole.GROUP_ADMIN && user.role !== UserRole.CLINIC_ADMIN) {
      throw new ForbiddenException("Only administrators may view clinic revenue breakdown");
    }
    const { start, end } = resolveReportingRange(fromStr, toStr);
    let scopeClinicIds: string[] | null = null;
    if (user.role === UserRole.CLINIC_ADMIN) {
      const scopes = await this.prisma.clinicAdminScope.findMany({
        where: { tenantId, userId: user.userId },
        select: { clinicId: true },
      });
      scopeClinicIds = scopes.map((s) => s.clinicId);
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
