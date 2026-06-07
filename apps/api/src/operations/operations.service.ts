import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OperationStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { resolveReportingRange } from "../common/reporting-range";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOperationDto } from "./dto/create-operation.dto";
import type { OperationDto } from "./dto/operation.dto";
import type { UpdateOperationDto } from "./dto/update-operation.dto";

const operationInclude = {
  patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, homeBranchId: true } },
  clinic: { select: { nameEn: true, nameAr: true } },
  clinician: {
    select: {
      displayName: true,
      employee: { select: { firstNameEn: true, lastNameEn: true } },
    },
  },
} as const;

type OperationRow = Prisma.OperationGetPayload<{ include: typeof operationInclude }>;

function isPhysicianRole(role: UserRole | undefined): boolean {
  return role === UserRole.PHYSICIAN || String(role) === "PHYSICIAN";
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private clinicianDisplayName(
    clinician: null | { displayName: string; employee: { firstNameEn: string; lastNameEn: string } | null }
  ): string | null {
    if (!clinician) return null;
    const e = clinician.employee;
    if (e) {
      const n = `${e.firstNameEn ?? ""} ${e.lastNameEn ?? ""}`.trim();
      if (n) return n;
    }
    const d = clinician.displayName?.trim();
    return d || null;
  }

  private mapRow(row: OperationRow): OperationDto {
    const patient = row.patient;
    return {
      id: row.id,
      clinicId: row.clinicId,
      clinicNameEn: row.clinic?.nameEn ?? null,
      clinicNameAr: row.clinic?.nameAr ?? null,
      patientId: row.patientId,
      patientMrn: patient?.mrn ?? null,
      patientName: patient ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim() : null,
      clinicianId: row.clinicianId,
      clinicianName: this.clinicianDisplayName(row.clinician ?? null),
      operationDate: row.operationDate.toISOString(),
      totalCost: Number(row.totalCost),
      downPayment: Number(row.downPayment),
      paidAmount: Number(row.paidAmount),
      balanceDue: Math.max(0, Number(row.totalCost) - Number(row.paidAmount)),
      comments: row.comments,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async assertOperationAccess(viewer: JwtUser, row: { clinicianId: string; clinicId: string }): Promise<void> {
    if (isPhysicianRole(viewer.role) && row.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only manage operations assigned to you");
    }
    if (viewer.tenantId == null) throw new ForbiddenException();
    const scopeIds = await fetchClinicScopeIds(this.prisma, viewer.tenantId, viewer);
    if (scopeIds !== null && !scopeIds.includes(row.clinicId)) {
      throw new ForbiddenException("This operation is outside your assigned clinics");
    }
  }

  async list(
    tenantId: string,
    user: JwtUser,
    fromStr?: string,
    toStr?: string,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    clinicIdStr?: string,
    statusStr?: string
  ) {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(pageStr, pageSizeStr);
      return paginate([], 0, page, pageSize);
    }

    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(
      sortByStr,
      ["operationDate", "totalCost", "downPayment", "createdAt", "status"] as const,
      "operationDate"
    );
    const sortDir = parseSortOrder(sortOrderStr);

    const and: Prisma.OperationWhereInput[] = [{ tenantId }];

    const { start, end } = resolveReportingRange(fromStr, toStr);
    and.push({ operationDate: { gte: start, lte: end } });

    if (isPhysicianRole(user.role)) {
      and.push({ clinicianId: user.userId });
    }

    const st = statusStr?.trim().toUpperCase();
    if (st && (Object.values(OperationStatus) as string[]).includes(st)) {
      and.push({ status: st as OperationStatus });
    }

    const clinicId = clinicIdStr?.trim();
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }

    const where: Prisma.OperationWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.operation.count({ where }),
      this.prisma.operation.findMany({
        where,
        include: operationInclude,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
      }),
    ]);
    return paginate(rows.map((r) => this.mapRow(r)), total, page, pageSize);
  }

  async create(tenantId: string, dto: CreateOperationDto, user: JwtUser): Promise<OperationDto> {
    const downPayment = dto.downPayment ?? 0;
    if (downPayment > dto.totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
      select: { id: true, homeBranchId: true, firstNameEn: true, lastNameEn: true, mrn: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const clinician = await this.prisma.user.findFirst({
      where: { id: dto.clinicianId, tenantId, role: UserRole.PHYSICIAN },
      select: { id: true, displayName: true },
    });
    if (!clinician) throw new BadRequestException("Clinician must be a physician in your organization");

    let clinicId = dto.clinicId?.trim();
    if (!clinicId) {
      clinicId = patient.homeBranchId ?? undefined;
    }
    if (!clinicId) {
      const first = await this.prisma.clinic.findFirst({
        where: { tenantId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      clinicId = first?.id;
    }
    if (!clinicId) throw new BadRequestException("No clinic available for this operation");

    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true } });
    if (!clinic) throw new BadRequestException("Clinic not found");

    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(clinicId)) {
      throw new ForbiddenException("Clinic is outside your assigned scope");
    }

    const operationDate = new Date(dto.operationDate);
    if (Number.isNaN(operationDate.getTime())) {
      throw new BadRequestException("Invalid operation date");
    }

    const row = await this.prisma.operation.create({
      data: {
        tenantId,
        clinicId,
        patientId: dto.patientId,
        clinicianId: dto.clinicianId,
        createdByUserId: user.userId,
        operationDate,
        totalCost: dto.totalCost,
        downPayment,
        paidAmount: downPayment,
        comments: dto.comments?.trim() || null,
        status: OperationStatus.SCHEDULED,
      },
      include: operationInclude,
    });
    return this.mapRow(row);
  }

  async listPayable(tenantId: string, user: JwtUser, clinicIdStr?: string): Promise<OperationDto[]> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) return [];

    const and: Prisma.OperationWhereInput[] = [
      { tenantId },
      { status: { not: OperationStatus.CANCELLED } },
    ];

    if (isPhysicianRole(user.role)) {
      and.push({ clinicianId: user.userId });
    }

    const clinicId = clinicIdStr?.trim();
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }

    const rows = await this.prisma.operation.findMany({
      where: { AND: and },
      include: operationInclude,
      orderBy: { operationDate: "desc" },
      take: 200,
    });

    return rows
      .filter((r) => Number(r.paidAmount) + 0.001 < Number(r.totalCost))
      .map((r) => this.mapRow(r));
  }

  async update(tenantId: string, id: string, dto: UpdateOperationDto, viewer: JwtUser): Promise<OperationDto> {
    const existing = await this.prisma.operation.findFirst({
      where: { id, tenantId },
      include: operationInclude,
    });
    if (!existing) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, existing);

    if (existing.status !== OperationStatus.SCHEDULED) {
      throw new BadRequestException("Only scheduled operations can be edited");
    }

    const totalCost = dto.totalCost ?? Number(existing.totalCost);
    const downPayment = dto.downPayment ?? Number(existing.downPayment);
    if (downPayment > totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    let paidAmount = Number(existing.paidAmount);
    if (dto.downPayment !== undefined) {
      const oldDown = Number(existing.downPayment);
      const newDown = dto.downPayment;
      if (Math.abs(paidAmount - oldDown) < 0.001) {
        paidAmount = newDown;
      } else {
        paidAmount = paidAmount + (newDown - oldDown);
      }
    }
    if (paidAmount > totalCost + 0.001) {
      throw new BadRequestException("Paid amount cannot exceed total cost");
    }
    if (paidAmount < 0) {
      throw new BadRequestException("Paid amount cannot be negative");
    }

    let clinicId = existing.clinicId;
    if (dto.clinicId?.trim()) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { id: dto.clinicId.trim(), tenantId },
        select: { id: true },
      });
      if (!clinic) throw new BadRequestException("Clinic not found");
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
      if (scopeIds !== null && !scopeIds.includes(clinic.id)) {
        throw new ForbiddenException("Clinic is outside your assigned scope");
      }
      clinicId = clinic.id;
    }

    let patientId = existing.patientId;
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException("Patient not found");
      patientId = patient.id;
    }

    let clinicianId = existing.clinicianId;
    if (dto.clinicianId) {
      const clinician = await this.prisma.user.findFirst({
        where: { id: dto.clinicianId, tenantId, role: UserRole.PHYSICIAN },
        select: { id: true },
      });
      if (!clinician) throw new BadRequestException("Clinician must be a physician in your organization");
      clinicianId = clinician.id;
    }

    let operationDate = existing.operationDate;
    if (dto.operationDate) {
      const d = new Date(dto.operationDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestException("Invalid operation date");
      operationDate = d;
    }

    const row = await this.prisma.operation.update({
      where: { id },
      data: {
        clinicId,
        patientId,
        clinicianId,
        operationDate,
        totalCost,
        downPayment,
        paidAmount,
        comments: dto.comments !== undefined ? dto.comments.trim() || null : existing.comments,
      },
      include: operationInclude,
    });
    return this.mapRow(row);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: OperationStatus,
    viewer: JwtUser,
    collectionAmount?: number
  ): Promise<OperationDto> {
    const existing = await this.prisma.operation.findFirst({
      where: { id, tenantId },
      include: operationInclude,
    });
    if (!existing) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, existing);

    if (existing.status === status) {
      return this.mapRow(existing);
    }

    if (existing.status === OperationStatus.COMPLETED || existing.status === OperationStatus.CANCELLED) {
      throw new BadRequestException("Cannot change status of a completed or cancelled operation");
    }

    if (status === OperationStatus.SCHEDULED) {
      throw new BadRequestException("Invalid status transition");
    }

    if (status === OperationStatus.COMPLETED) {
      const total = Number(existing.totalCost);
      const paid = Number(existing.paidAmount);
      const remaining = Math.max(0, total - paid);
      if (total <= 0) {
        throw new BadRequestException("Operation total cost must be greater than zero to complete");
      }

      if (remaining > 0.001) {
        if (collectionAmount === undefined || collectionAmount <= 0) {
          throw new BadRequestException("Collect the remaining balance before completing this operation");
        }
        if (Math.abs(collectionAmount - remaining) > 0.001) {
          throw new BadRequestException(
            `Collected amount must equal the remaining balance (${remaining.toFixed(2)} AED)`
          );
        }
      }

      const patientName = existing.patient
        ? `${existing.patient.firstNameEn} ${existing.patient.lastNameEn}`.trim()
        : existing.patientId;
      const clinicianName = this.clinicianDisplayName(existing.clinician ?? null) ?? existing.clinicianId;

      const row = await this.prisma.$transaction(async (tx) => {
        await tx.revenueEntry.updateMany({
          where: { tenantId, operationId: id, status: RevenueStatus.POSTED },
          data: { status: RevenueStatus.VOID },
        });
        await tx.revenueEntry.create({
          data: {
            tenantId,
            clinicId: existing.clinicId,
            operationId: id,
            category: "OPERATION",
            description: `Operation · ${patientName} · ${clinicianName}`,
            grossAmount: total,
            taxAmount: 0,
            netAmount: total,
            currency: "AED",
            postedAt: new Date(),
            status: RevenueStatus.POSTED,
          },
        });
        return tx.operation.update({
          where: { id },
          data: { status: OperationStatus.COMPLETED, paidAmount: total },
          include: operationInclude,
        });
      });
      return this.mapRow(row);
    }

    if (status === OperationStatus.CANCELLED) {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.revenueEntry.updateMany({
          where: { tenantId, operationId: id, status: RevenueStatus.POSTED },
          data: { status: RevenueStatus.VOID },
        });
        return tx.operation.update({
          where: { id },
          data: { status: OperationStatus.CANCELLED, paidAmount: 0 },
          include: operationInclude,
        });
      });
      return this.mapRow(row);
    }

    throw new BadRequestException("Invalid status");
  }
}
