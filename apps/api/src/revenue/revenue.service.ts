import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, RevenueStatus } from "@prisma/client";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { resolveReportingRange } from "../common/reporting-range";
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
    sortOrderStr?: string
  ) {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const clinicId = clinicIdStr?.trim();
    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : {}),
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

  async totals(tenantId: string, fromStr?: string, toStr?: string, clinicIdStr?: string): Promise<RevenueTotalsDto> {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim();
    const where: Prisma.RevenueEntryWhereInput = {
      tenantId,
      postedAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : {}),
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
}
