import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CLINIC_SCOPE_ROLES, fetchClinicScopeIds, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateClinicDto } from "./dto/create-clinic.dto";
import type { PatchClinicDto } from "./dto/patch-clinic.dto";
import type { ClinicDetailDto } from "./dto/clinic-detail.dto";
import type { ClinicPhysicianDto } from "./dto/clinic-physician.dto";

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

  private static readonly CLINIC_PHYSICIAN_MANAGE_ROLES: ReadonlySet<UserRole> = new Set([
    UserRole.GROUP_ADMIN,
    UserRole.CLINIC_ADMIN,
    UserRole.BRANCH_MANAGER,
  ]);

  private static readonly SCHEDULING_ROLES: ReadonlySet<UserRole> = new Set([
    UserRole.GROUP_ADMIN,
    UserRole.CLINIC_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CLINIC_ASSISTANT,
    UserRole.RECEPTIONIST,
  ]);

  private async assertClinicVisible(tenantId: string, clinicId: string, user: JwtUser): Promise<void> {
    const row = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true } });
    if (!row) throw new NotFoundException("Clinic not found");
    if (user.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, user.userId);
      if (!net.includes(clinicId)) throw new NotFoundException("Clinic not found");
      return;
    }
    if (CLINIC_SCOPE_ROLES.has(user.role)) {
      const scope = await this.prisma.clinicAdminScope.findFirst({
        where: { tenantId, userId: user.userId, clinicId },
      });
      if (!scope) throw new NotFoundException("Clinic not found");
    }
  }

  private mapPhysicianEmployee(e: {
    id: string;
    jobTitle: string;
    user: { id: string; displayName: string; email: string } | null;
  }): ClinicPhysicianDto {
    const u = e.user!;
    return {
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      employeeId: e.id,
      jobTitle: e.jobTitle,
    };
  }

  private physicianSearchFilter(search?: string): Prisma.EmployeeWhereInput | undefined {
    const q = search?.trim();
    if (!q) return undefined;
    return {
      OR: [
        { firstNameEn: { contains: q, mode: "insensitive" } },
        { lastNameEn: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { user: { is: { displayName: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      ],
    };
  }

  async listClinicPhysicians(
    tenantId: string,
    clinicId: string,
    user: JwtUser,
    search?: string
  ): Promise<ClinicPhysicianDto[]> {
    await this.assertClinicVisible(tenantId, clinicId, user);
    const searchFilter = this.physicianSearchFilter(search);
    const rows = await this.prisma.employee.findMany({
      where: {
        tenantId,
        clinicId,
        userId: { not: null },
        user: { is: { role: UserRole.PHYSICIAN } },
        ...(searchFilter ?? {}),
      },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ user: { displayName: "asc" } }],
    });
    return rows.filter((r) => r.user).map((r) => this.mapPhysicianEmployee(r as typeof r & { user: NonNullable<typeof r.user> }));
  }

  /** Physicians available in the tenant but not yet assigned to this clinic. */
  async listAvailablePhysicians(
    tenantId: string,
    clinicId: string,
    user: JwtUser,
    search?: string
  ): Promise<ClinicPhysicianDto[]> {
    if (!ClinicsService.CLINIC_PHYSICIAN_MANAGE_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to assign physicians");
    }
    await this.assertClinicVisible(tenantId, clinicId, user);

    const assigned = await this.prisma.employee.findMany({
      where: { tenantId, clinicId, userId: { not: null }, user: { is: { role: UserRole.PHYSICIAN } } },
      select: { userId: true },
    });
    const assignedIds = assigned.map((a) => a.userId!).filter(Boolean);

    const q = search?.trim();
    const userWhere: Prisma.UserWhereInput = {
      tenantId,
      role: UserRole.PHYSICIAN,
      ...(assignedIds.length ? { id: { notIn: assignedIds } } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const users = await this.prisma.user.findMany({
      where: userWhere,
      orderBy: { displayName: "asc" },
      take: 50,
    });

    return users.map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      employeeId: "",
      jobTitle: null,
    }));
  }

  async assignPhysician(tenantId: string, clinicId: string, userId: string, viewer: JwtUser): Promise<ClinicPhysicianDto> {
    if (!ClinicsService.CLINIC_PHYSICIAN_MANAGE_ROLES.has(viewer.role)) {
      throw new ForbiddenException("You do not have permission to assign physicians");
    }
    await this.assertClinicVisible(tenantId, clinicId, viewer);

    const physician = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, role: UserRole.PHYSICIAN },
    });
    if (!physician) throw new BadRequestException("User must be a physician in your organization");

    const existing = await this.prisma.employee.findFirst({
      where: { tenantId, clinicId, userId: physician.id },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    if (existing?.user) return this.mapPhysicianEmployee(existing as typeof existing & { user: NonNullable<typeof existing.user> });

    const parts = physician.displayName.trim().split(/\s+/);
    const firstNameEn = parts[0] ?? "Physician";
    const lastNameEn = parts.length > 1 ? parts.slice(1).join(" ") : "Staff";
    const employeeNumber = await this.nextPhysicianEmployeeNumber(tenantId);

    const row = await this.prisma.employee.create({
      data: {
        tenantId,
        clinicId,
        employeeNumber,
        firstNameEn,
        lastNameEn,
        email: physician.email,
        phone: "0000000000",
        jobTitle: "Attending Physician",
        employmentType: EmploymentType.FULL_TIME,
        hireDate: new Date(),
        salaryBase: 0,
        userId: physician.id,
      },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return this.mapPhysicianEmployee(row as typeof row & { user: NonNullable<typeof row.user> });
  }

  async removePhysician(tenantId: string, clinicId: string, userId: string, viewer: JwtUser): Promise<void> {
    if (!ClinicsService.CLINIC_PHYSICIAN_MANAGE_ROLES.has(viewer.role)) {
      throw new ForbiddenException("You do not have permission to remove physician assignments");
    }
    await this.assertClinicVisible(tenantId, clinicId, viewer);
    const row = await this.prisma.employee.findFirst({
      where: { tenantId, clinicId, userId, user: { is: { role: UserRole.PHYSICIAN } } },
    });
    if (!row) throw new NotFoundException("Physician is not assigned to this clinic");
    await this.prisma.employee.delete({ where: { id: row.id } });
  }

  /** Roster for scheduling (operations, appointments) — scoped to clinic when provided. */
  async listSchedulingPhysicians(
    tenantId: string,
    user: JwtUser,
    clinicId?: string,
    search?: string
  ): Promise<ClinicPhysicianDto[]> {
    if (!ClinicsService.SCHEDULING_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to list physicians");
    }

    if (clinicId?.trim()) {
      return this.listClinicPhysicians(tenantId, clinicId.trim(), user, search);
    }

    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const q = search?.trim();
    const rows = await this.prisma.employee.findMany({
      where: {
        tenantId,
        userId: { not: null },
        user: {
          is: {
            role: UserRole.PHYSICIAN,
            ...(q
              ? {
                  OR: [
                    { displayName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
        },
        ...(scopeIds !== null ? { clinicId: { in: scopeIds } } : {}),
      },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ user: { displayName: "asc" } }],
      take: 100,
    });

    const seen = new Set<string>();
    const out: ClinicPhysicianDto[] = [];
    for (const r of rows) {
      if (!r.user || seen.has(r.user.id)) continue;
      seen.add(r.user.id);
      out.push(this.mapPhysicianEmployee(r as typeof r & { user: NonNullable<typeof r.user> }));
    }
    return out;
  }

  private async nextPhysicianEmployeeNumber(tenantId: string): Promise<string> {
    for (let n = 1; n < 10000; n += 1) {
      const candidate = `EMP-PHYS-${String(n).padStart(4, "0")}`;
      const exists = await this.prisma.employee.findFirst({
        where: { tenantId, employeeNumber: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException("Could not allocate employee number");
  }

  async getOne(tenantId: string, id: string, user: JwtUser): Promise<ClinicDetailDto> {
    const row = await this.prisma.clinic.findFirst({
      where: { id, tenantId },
      include: { parent: { select: { id: true, nameEn: true, nameAr: true } } },
    });
    if (!row) throw new NotFoundException("Clinic not found");
    if (user.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, user.userId);
      if (!net.includes(id)) throw new NotFoundException("Clinic not found");
    }
    if (user.role === UserRole.CLINIC_ADMIN || user.role === UserRole.BRANCH_MANAGER) {
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
    if (user.role === UserRole.PHYSICIAN) {
      const ids = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, user.userId);
      if (!ids.length) return [];
      where = { tenantId, id: { in: ids } };
    } else if (user.role === UserRole.CLINIC_ADMIN || user.role === UserRole.BRANCH_MANAGER) {
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

    let parentClinicId: string | null = null;
    const rawParent = dto.parentClinicId as unknown;
    if (rawParent !== undefined && rawParent !== null) {
      const s = typeof rawParent === "string" ? rawParent.trim() : String(rawParent).trim();
      if (s.length > 64) throw new BadRequestException("parentClinicId is too long");
      if (s) parentClinicId = s;
    }
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

  async update(tenantId: string, id: string, dto: PatchClinicDto, user?: JwtUser) {
    if (user) await this.assertClinicVisible(tenantId, id, user);
    const existing = await this.prisma.clinic.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Clinic not found");

    const data: Record<string, string | null> = {};
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn.trim();
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr.trim();
    if (dto.country !== undefined) data.country = dto.country.trim() || "AE";
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.addressEn !== undefined) data.addressEn = dto.addressEn.trim();
    if (dto.addressAr !== undefined) data.addressAr = dto.addressAr.trim();
    if (dto.locationUrl !== undefined) data.locationUrl = dto.locationUrl.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.licenseNumber !== undefined) data.licenseNumber = dto.licenseNumber.trim();
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl.trim() || null;
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.clinic.update({
      where: { id },
      data,
      include: { parent: { select: { nameEn: true, nameAr: true } } },
    });

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
}
