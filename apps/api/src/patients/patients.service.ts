import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Gender, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PatientDto } from "../common/dto/patient.dto";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreatePatientDto } from "./dto/create-patient.dto";
import type { UpdatePatientDto } from "./dto/update-patient.dto";

export interface PatientListQuery {
  search?: string;
  mrn?: string;
  phone?: string;
  gender?: string;
  name?: string;
  nationalId?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(p: {
    id: string;
    mrn: string;
    firstNameEn: string;
    lastNameEn: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
    dob: Date;
    gender: string;
    phone: string;
    email: string | null;
    nationalId: string | null;
    homeBranchId: string | null;
    homeBranch: { nameEn: string } | null;
  }): PatientDto {
    const dto = new PatientDto();
    dto.id = p.id;
    dto.mrn = p.mrn;
    dto.firstNameEn = p.firstNameEn;
    dto.lastNameEn = p.lastNameEn;
    dto.firstNameAr = p.firstNameAr;
    dto.lastNameAr = p.lastNameAr;
    dto.dob = p.dob.toISOString().slice(0, 10);
    dto.gender = p.gender as PatientDto["gender"];
    dto.phone = p.phone;
    dto.email = p.email;
    dto.nationalId = p.nationalId;
    dto.homeBranch = p.homeBranch ? p.homeBranch.nameEn : null;
    dto.homeBranchId = p.homeBranchId;
    return dto;
  }

  private buildWhere(tenantId: string, q: PatientListQuery, scopeClinicIds: string[] | null): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
    };
    const and: Prisma.PatientWhereInput[] = [];

    if (scopeClinicIds?.length) {
      and.push({
        OR: [{ homeBranchId: { in: scopeClinicIds } }, { encounters: { some: { clinicId: { in: scopeClinicIds } } } }],
      });
    }

    const broad = q.search?.trim() ?? "";
    if (broad.length > 0) {
      and.push({
        OR: [
          { mrn: { contains: broad, mode: "insensitive" } },
          { firstNameEn: { contains: broad, mode: "insensitive" } },
          { lastNameEn: { contains: broad, mode: "insensitive" } },
          { firstNameAr: { contains: broad, mode: "insensitive" } },
          { lastNameAr: { contains: broad, mode: "insensitive" } },
          { phone: { contains: broad, mode: "insensitive" } },
          { nationalId: { contains: broad, mode: "insensitive" } },
        ],
      });
    }

    const mrn = q.mrn?.trim();
    if (mrn) and.push({ mrn: { contains: mrn, mode: "insensitive" } });

    const phone = q.phone?.trim();
    if (phone) and.push({ phone: { contains: phone, mode: "insensitive" } });

    const nationalId = q.nationalId?.trim();
    if (nationalId) and.push({ nationalId: { contains: nationalId, mode: "insensitive" } });

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

    const g = q.gender?.trim().toUpperCase();
    if (g && (Object.values(Gender) as string[]).includes(g)) {
      and.push({ gender: g as Gender });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  async listPaginated(tenantId: string, q: PatientListQuery, user: JwtUser) {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(q.page, q.pageSize);
      return paginate([], 0, page, pageSize);
    }
    const { page, pageSize, skip } = parsePageParams(q.page, q.pageSize);
    const where = this.buildWhere(tenantId, q, scopeIds);
    const sortField = pickSortField(q.sortBy, ["mrn", "dob", "firstNameEn", "lastNameEn", "createdAt", "gender"] as const, "mrn");
    const sortDir = parseSortOrder(q.sortOrder);
    const [total, rows] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: { homeBranch: { select: { nameEn: true, id: true } } },
      }),
    ]);
    return paginate(rows.map((r) => this.map(r)), total, page, pageSize);
  }

  async getById(tenantId: string, id: string, user: JwtUser): Promise<PatientDto> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const row = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { homeBranch: { select: { nameEn: true } } },
    });
    if (!row) throw new NotFoundException("Patient not found");
    if (scopeIds?.length) {
      const homeOk = row.homeBranchId && scopeIds.includes(row.homeBranchId);
      if (!homeOk) {
        const visitOk = await this.prisma.encounter.findFirst({
          where: { tenantId, patientId: id, clinicId: { in: scopeIds } },
          select: { id: true },
        });
        if (!visitOk) throw new NotFoundException("Patient not found");
      }
    }
    return this.map(row);
  }

  private async nextMrn(tenantId: string): Promise<string> {
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, mrn: { startsWith: "MRN-" } },
      select: { mrn: true },
    });
    let n = 10000;
    for (const r of rows) {
      const m = /^MRN-(\d+)$/.exec(r.mrn);
      if (m) n = Math.max(n, Number.parseInt(m[1], 10));
    }
    return `MRN-${String(n + 1).padStart(5, "0")}`;
  }

  private async assertHomeBranchInScope(tenantId: string, user: JwtUser, homeBranchId: string | null | undefined): Promise<void> {
    if (!homeBranchId) return;
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(homeBranchId)) {
      throw new ForbiddenException("homeBranchId is outside clinics you manage");
    }
  }

  async create(tenantId: string, dto: CreatePatientDto, user: JwtUser): Promise<PatientDto> {
    await this.assertHomeBranchInScope(tenantId, user, dto.homeBranchId ?? null);
    if (dto.homeBranchId) {
      const branch = await this.prisma.clinic.findFirst({
        where: { id: dto.homeBranchId, tenantId },
      });
      if (!branch) throw new BadRequestException("Invalid homeBranchId");
    }
    const nationalId = dto.nationalId?.trim() || null;
    if (nationalId) {
      const clash = await this.prisma.patient.findFirst({
        where: { tenantId, nationalId, deletedAt: null },
      });
      if (clash) throw new BadRequestException("nationalId already in use");
    }
    const mrn = await this.nextMrn(tenantId);
    const row = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstNameEn: dto.firstNameEn,
        lastNameEn: dto.lastNameEn,
        firstNameAr: dto.firstNameAr ?? null,
        lastNameAr: dto.lastNameAr ?? null,
        dob: new Date(dto.dob),
        gender: dto.gender,
        phone: dto.phone,
        email: dto.email?.trim() || null,
        nationalId,
        homeBranchId: dto.homeBranchId ?? null,
      },
      include: { homeBranch: { select: { nameEn: true } } },
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdatePatientDto, user: JwtUser): Promise<PatientDto> {
    await this.getById(tenantId, id, user);
    const existing = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Patient not found");
    if (dto.homeBranchId !== undefined) {
      await this.assertHomeBranchInScope(tenantId, user, dto.homeBranchId ?? null);
    }
    if (dto.homeBranchId) {
      const branch = await this.prisma.clinic.findFirst({
        where: { id: dto.homeBranchId, tenantId },
      });
      if (!branch) throw new BadRequestException("Invalid homeBranchId");
    }
    const nextNational = dto.nationalId !== undefined ? (dto.nationalId?.trim() || null) : undefined;
    if (nextNational) {
      const clash = await this.prisma.patient.findFirst({
        where: { tenantId, nationalId: nextNational, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("nationalId already in use");
    }
    const data: Prisma.PatientUpdateInput = {};
    if (dto.firstNameEn !== undefined) data.firstNameEn = dto.firstNameEn;
    if (dto.lastNameEn !== undefined) data.lastNameEn = dto.lastNameEn;
    if (dto.firstNameAr !== undefined) data.firstNameAr = dto.firstNameAr ?? null;
    if (dto.lastNameAr !== undefined) data.lastNameAr = dto.lastNameAr ?? null;
    if (dto.dob !== undefined) data.dob = new Date(dto.dob);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.nationalId !== undefined) data.nationalId = nextNational ?? null;
    if (dto.homeBranchId !== undefined) data.homeBranch = dto.homeBranchId ? { connect: { id: dto.homeBranchId } } : { disconnect: true };

    const row = await this.prisma.patient.update({
      where: { id },
      data,
      include: { homeBranch: { select: { nameEn: true } } },
    });
    return this.map(row);
  }
}
