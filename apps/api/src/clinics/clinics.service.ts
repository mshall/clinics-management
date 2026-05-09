import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateClinicDto } from "./dto/create-clinic.dto";
import type { ClinicDetailDto } from "./dto/clinic-detail.dto";

export interface ClinicDto {
  id: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: "parent" | "branch";
  logoUrl: string | null;
}

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOne(tenantId: string, id: string, user: JwtUser): Promise<ClinicDetailDto> {
    const row = await this.prisma.clinic.findFirst({
      where: { id, tenantId },
      include: { parent: { select: { id: true, nameEn: true, nameAr: true } } },
    });
    if (!row) throw new NotFoundException("Clinic not found");
    if (user.role === UserRole.CLINIC_ADMIN) {
      const scope = await this.prisma.clinicAdminScope.findFirst({
        where: { tenantId, userId: user.userId, clinicId: id },
      });
      if (!scope) throw new NotFoundException("Clinic not found");
    }
    return {
      id: row.id,
      parentClinicId: row.parentClinicId,
      parentNameEn: row.parent?.nameEn ?? null,
      parentNameAr: row.parent?.nameAr ?? null,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      city: row.city,
      country: row.country,
      kind: row.parentClinicId ? "branch" : "parent",
      logoUrl: row.logoUrl ?? null,
      addressEn: row.addressEn,
      addressAr: row.addressAr,
      locationUrl: row.locationUrl,
      phone: row.phone,
      email: row.email,
      licenseNumber: row.licenseNumber,
      defaultLanguage: row.defaultLanguage,
    };
  }

  async list(tenantId: string, user: JwtUser): Promise<ClinicDto[]> {
    let where: Prisma.ClinicWhereInput = { tenantId };
    if (user.role === UserRole.CLINIC_ADMIN) {
      const scopes = await this.prisma.clinicAdminScope.findMany({
        where: { tenantId, userId: user.userId },
        select: { clinicId: true },
      });
      const ids = scopes.map((s) => s.clinicId);
      if (!ids.length) return [];
      where = { tenantId, id: { in: ids } };
    }
    const rows = await this.prisma.clinic.findMany({
      where,
      orderBy: [{ parentClinicId: "asc" }, { nameEn: "asc" }],
      include: { parent: { select: { nameEn: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      parentClinicId: c.parentClinicId,
      parentNameEn: c.parent?.nameEn ?? null,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: c.parentClinicId ? "branch" : "parent",
      logoUrl: c.logoUrl ?? null,
    }));
  }

  async create(tenantId: string, dto: CreateClinicDto): Promise<ClinicDto> {
    const country = dto.country?.trim() || "AE";
    const addressEn = dto.addressEn?.trim() || "Address pending";
    const addressAr = dto.addressAr?.trim() || "العنوان قيد التحديث";
    const locationUrl = dto.locationUrl?.trim() || "https://maps.google.com/";
    const phone = dto.phone?.trim() || "0000000000";
    const email = dto.email?.trim().toLowerCase() || "clinic@local.invalid";
    const licenseNumber = dto.licenseNumber?.trim() || "LIC-PENDING";

    let parentClinicId: string | null = dto.parentClinicId ?? null;
    if (parentClinicId) {
      const parent = await this.prisma.clinic.findFirst({
        where: { id: parentClinicId, tenantId },
      });
      if (!parent) throw new BadRequestException("Invalid parentClinicId");
    }

    const logoUrl = dto.logoUrl?.trim() || null;

    const row = await this.prisma.clinic.create({
      data: {
        tenantId,
        parentClinicId,
        nameEn: dto.nameEn.trim(),
        nameAr: dto.nameAr.trim(),
        country,
        city: dto.city.trim(),
        addressEn,
        addressAr,
        locationUrl,
        phone,
        email,
        licenseNumber,
        logoUrl,
      },
      include: { parent: { select: { nameEn: true } } },
    });

    return {
      id: row.id,
      parentClinicId: row.parentClinicId,
      parentNameEn: row.parent?.nameEn ?? null,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      city: row.city,
      country: row.country,
      kind: row.parentClinicId ? "branch" : "parent",
      logoUrl: row.logoUrl ?? null,
    };
  }
}
