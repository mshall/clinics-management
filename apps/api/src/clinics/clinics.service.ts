import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateClinicDto } from "./dto/create-clinic.dto";

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

  async list(tenantId: string): Promise<ClinicDto[]> {
    const rows = await this.prisma.clinic.findMany({
      where: { tenantId },
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
