import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CLINIC_SCOPE_ROLES, fetchClinicScopeIds, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateClinicDto } from "./dto/create-clinic.dto";
import type { PatchClinicDto } from "./dto/patch-clinic.dto";
import type { ClinicDetailDto } from "./dto/clinic-detail.dto";
import { isBaseCurrency } from "../common/base-currencies";
import type { ClinicPhysicianDto } from "./dto/clinic-physician.dto";
import type { ClinicKind } from "./clinic-kind";
import { resolveClinicKind } from "./clinic-kind";

export interface ClinicDto {
  id: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: ClinicKind;
  logoUrl: string | null;
  defaultCurrency: string;
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
    UserRole.GROUP_SUPERVISOR,
    UserRole.CLINIC_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CLINIC_ASSISTANT,
    UserRole.RECEPTIONIST,
    UserRole.CALL_CENTER,
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
    firstNameEn: string;
    lastNameEn: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
    email: string | null;
    user: { id: string; displayName: string; email: string } | null;
  }): ClinicPhysicianDto {
    const u = e.user!;
    const enName = `${e.firstNameEn ?? ""} ${e.lastNameEn ?? ""}`.trim();
    return {
      userId: u.id,
      displayName: enName || u.displayName,
      email: u.email ?? e.email,
      employeeId: e.id,
      jobTitle: e.jobTitle,
      firstNameEn: e.firstNameEn,
      lastNameEn: e.lastNameEn,
      firstNameAr: e.firstNameAr,
      lastNameAr: e.lastNameAr,
    };
  }

  private physicianSearchFilter(search?: string): Prisma.EmployeeWhereInput | undefined {
    const q = search?.trim();
    if (!q) return undefined;
    return {
      OR: [
        { firstNameEn: { contains: q, mode: "insensitive" } },
        { lastNameEn: { contains: q, mode: "insensitive" } },
        { firstNameAr: { contains: q, mode: "insensitive" } },
        { lastNameAr: { contains: q, mode: "insensitive" } },
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
              {
                employee: {
                  is: {
                    OR: [
                      { firstNameEn: { contains: q, mode: "insensitive" } },
                      { lastNameEn: { contains: q, mode: "insensitive" } },
                      { firstNameAr: { contains: q, mode: "insensitive" } },
                      { lastNameAr: { contains: q, mode: "insensitive" } },
                      { email: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const users = await this.prisma.user.findMany({
      where: userWhere,
      include: {
        employee: {
          select: {
            id: true,
            jobTitle: true,
            firstNameEn: true,
            lastNameEn: true,
            firstNameAr: true,
            lastNameAr: true,
            email: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
      take: 50,
    });

    return users.map((u) => {
      const emp = u.employee;
      if (emp) {
        return this.mapPhysicianEmployee({
          ...emp,
          user: { id: u.id, displayName: u.displayName, email: u.email },
        } as Parameters<typeof this.mapPhysicianEmployee>[0]);
      }
      const parts = u.displayName.trim().split(/\s+/);
      return {
        userId: u.id,
        displayName: u.displayName,
        email: u.email,
        employeeId: "",
        jobTitle: null,
        firstNameEn: parts[0] ?? u.displayName,
        lastNameEn: parts.length > 1 ? parts.slice(1).join(" ") : "",
        firstNameAr: null,
        lastNameAr: null,
      };
    });
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

    const existingAtClinic = await this.prisma.employee.findFirst({
      where: { tenantId, clinicId, userId: physician.id },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    if (existingAtClinic?.user) {
      return this.mapPhysicianEmployee(existingAtClinic as typeof existingAtClinic & { user: NonNullable<typeof existingAtClinic.user> });
    }

    const existingLinked = await this.prisma.employee.findFirst({
      where: { tenantId, userId: physician.id },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    if (existingLinked?.user) {
      const row = await this.prisma.employee.update({
        where: { id: existingLinked.id },
        data: { clinicId, email: physician.email },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      });
      return this.mapPhysicianEmployee(row as typeof row & { user: NonNullable<typeof row.user> });
    }

    const existingStub = await this.prisma.employee.findFirst({
      where: { tenantId, clinicId, userId: null, email: physician.email },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    if (existingStub) {
      const row = await this.prisma.employee.update({
        where: { id: existingStub.id },
        data: { userId: physician.id },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      });
      return this.mapPhysicianEmployee(row as typeof row & { user: NonNullable<typeof row.user> });
    }

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
    await this.prisma.employee.update({
      where: { id: row.id },
      data: { userId: null },
    });
  }

  private mapPhysicianFromUser(u: { id: string; displayName: string; email: string }): ClinicPhysicianDto {
    const parts = u.displayName.trim().split(/\s+/);
    return {
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      employeeId: "",
      jobTitle: null,
      firstNameEn: parts[0] ?? u.displayName,
      lastNameEn: parts.length > 1 ? parts.slice(1).join(" ") : "",
      firstNameAr: null,
      lastNameAr: null,
    };
  }

  /** Roster for scheduling (operations, appointments) — all org physicians; clinicId prioritizes matches. */
  async listSchedulingPhysicians(
    tenantId: string,
    user: JwtUser,
    clinicId?: string,
    search?: string
  ): Promise<ClinicPhysicianDto[]> {
    if (!ClinicsService.SCHEDULING_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to list physicians");
    }

    const clinicFilter = clinicId?.trim();
    if (clinicFilter) {
      await this.assertClinicVisible(tenantId, clinicFilter, user);
    }

    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const q = search?.trim();

    const searchOr: Prisma.UserWhereInput[] | undefined = q
      ? [
          { displayName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          {
            employee: {
              is: {
                OR: [
                  { firstNameEn: { contains: q, mode: "insensitive" } },
                  { lastNameEn: { contains: q, mode: "insensitive" } },
                  { firstNameAr: { contains: q, mode: "insensitive" } },
                  { lastNameAr: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
        ]
      : undefined;

    const userWhere: Prisma.UserWhereInput = {
      tenantId,
      role: UserRole.PHYSICIAN,
      ...(searchOr ? { OR: searchOr } : {}),
      ...(scopeIds !== null
        ? {
            OR: [{ employee: { is: null } }, { employee: { is: { clinicId: { in: scopeIds } } } }],
          }
        : {}),
    };

    const users = await this.prisma.user.findMany({
      where: userWhere,
      include: {
        employee: {
          select: {
            id: true,
            clinicId: true,
            jobTitle: true,
            firstNameEn: true,
            lastNameEn: true,
            firstNameAr: true,
            lastNameAr: true,
            email: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
      take: 150,
    });

    const atClinic: ClinicPhysicianDto[] = [];
    const other: ClinicPhysicianDto[] = [];
    const seen = new Set<string>();

    for (const u of users) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      const dto = u.employee
        ? this.mapPhysicianEmployee({
            id: u.employee.id,
            jobTitle: u.employee.jobTitle,
            firstNameEn: u.employee.firstNameEn,
            lastNameEn: u.employee.lastNameEn,
            firstNameAr: u.employee.firstNameAr,
            lastNameAr: u.employee.lastNameAr,
            email: u.employee.email,
            user: { id: u.id, displayName: u.displayName, email: u.email },
          })
        : this.mapPhysicianFromUser(u);

      if (clinicFilter && u.employee?.clinicId === clinicFilter) {
        atClinic.push(dto);
      } else {
        other.push(dto);
      }
    }

    return [...atClinic, ...other].slice(0, 100);
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
      include: {
        parent: { select: { id: true, nameEn: true, nameAr: true } },
        _count: { select: { branches: true } },
      },
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
      kind: resolveClinicKind(row.parentClinicId, row._count.branches),
      logoUrl: row.logoUrl ?? null,
      addressEn: row.addressEn,
      addressAr: row.addressAr,
      locationUrl: row.locationUrl,
      phone: row.phone,
      email: row.email,
      licenseNumber: row.licenseNumber,
      defaultLanguage: row.defaultLanguage,
      defaultCurrency: row.defaultCurrency,
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
      include: { parent: { select: { nameEn: true } }, _count: { select: { branches: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      parentClinicId: c.parentClinicId,
      parentNameEn: c.parent?.nameEn ?? null,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: resolveClinicKind(c.parentClinicId, c._count.branches),
      logoUrl: c.logoUrl ?? null,
      defaultCurrency: c.defaultCurrency,
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
      if (parent.parentClinicId) {
        throw new BadRequestException("Branches can only be created under a root-level clinic");
      }
    }

    const logoUrl = dto.logoUrl?.trim() || null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });
    const defaultCurrency =
      dto.defaultCurrency?.trim() && isBaseCurrency(dto.defaultCurrency.trim())
        ? dto.defaultCurrency.trim()
        : tenant?.baseCurrency ?? "AED";

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
        defaultCurrency,
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
      kind: resolveClinicKind(row.parentClinicId, 0),
      logoUrl: row.logoUrl ?? null,
      defaultCurrency: row.defaultCurrency,
    };
  }

  async update(tenantId: string, id: string, dto: PatchClinicDto, user?: JwtUser) {
    if (user) await this.assertClinicVisible(tenantId, id, user);
    const existing = await this.prisma.clinic.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { branches: true } } },
    });
    if (!existing) throw new NotFoundException("Clinic not found");

    const data: Record<string, string | null> = {};
    if (dto.parentClinicId !== undefined) {
      if (dto.parentClinicId === null) {
        if (existing._count.branches > 0) {
          throw new BadRequestException("Cannot detach parent: this clinic has branches assigned to it");
        }
        data.parentClinicId = null;
      } else {
        if (dto.parentClinicId === id) throw new BadRequestException("A clinic cannot be its own parent");
        const parent = await this.prisma.clinic.findFirst({
          where: { id: dto.parentClinicId, tenantId },
        });
        if (!parent) throw new BadRequestException("Invalid parentClinicId");
        if (parent.parentClinicId) {
          throw new BadRequestException("Branches can only be attached under a root-level clinic");
        }
        data.parentClinicId = dto.parentClinicId;
      }
    }
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
    if (dto.defaultCurrency !== undefined) {
      if (!isBaseCurrency(dto.defaultCurrency.trim())) {
        throw new BadRequestException("Invalid default currency");
      }
      data.defaultCurrency = dto.defaultCurrency.trim();
    }
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.clinic.update({
      where: { id },
      data,
      include: {
        parent: { select: { nameEn: true, nameAr: true } },
        _count: { select: { branches: true } },
      },
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
      kind: resolveClinicKind(row.parentClinicId, row._count.branches),
      logoUrl: row.logoUrl ?? null,
      addressEn: row.addressEn,
      addressAr: row.addressAr,
      locationUrl: row.locationUrl,
      phone: row.phone,
      email: row.email,
      licenseNumber: row.licenseNumber,
      defaultLanguage: row.defaultLanguage,
      defaultCurrency: row.defaultCurrency,
    };
  }
}
