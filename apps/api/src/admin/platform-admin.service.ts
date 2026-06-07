import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { ClinicsService } from "../clinics/clinics.service";
import type { CreateClinicDto } from "../clinics/dto/create-clinic.dto";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";
import type { CreateTenantDto } from "./dto/create-tenant.dto";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PlatformPatchTenantDto } from "./dto/platform-patch-tenant.dto";

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly clinics: ClinicsService,
  ) {}

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can use this API");
    }
  }

  private async assertTenant(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!row) throw new NotFoundException("Organization not found");
    return row;
  }

  async getOverview(user: JwtUser) {
    this.assertPlatform(user);
    const [tenantCount, userCount, clinicCount, patientCount, encounterCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count({ where: { tenantId: { not: null } } }),
      this.prisma.clinic.count(),
      this.prisma.patient.count(),
      this.prisma.encounter.count(),
    ]);
    const recentTenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { users: true, clinics: true } },
      },
    });
    return {
      tenantCount,
      userCount,
      clinicCount,
      patientCount,
      encounterCount,
      recentTenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        userCount: t._count.users,
        clinicCount: t._count.clinics,
      })),
    };
  }

  listTenants(
    user: JwtUser,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
  ) {
    this.assertPlatform(user);
    return this.admin.listTenants(pageStr, pageSizeStr, sortByStr, sortOrderStr);
  }

  async getTenant(user: JwtUser, tenantId: string) {
    this.assertPlatform(user);
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        defaultLocale: true,
        defaultVisitFee: true,
        createdAt: true,
        _count: { select: { users: true, clinics: true, patients: true } },
      },
    });
    if (!row) throw new NotFoundException("Organization not found");
    return {
      id: row.id,
      name: row.name,
      baseCurrency: row.baseCurrency,
      defaultLocale: row.defaultLocale,
      defaultVisitFee: Number(row.defaultVisitFee),
      createdAt: row.createdAt.toISOString(),
      counts: row._count,
    };
  }

  async createTenant(user: JwtUser, dto: CreateTenantDto) {
    this.assertPlatform(user);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("name is required");

    const ga = dto.groupAdmin;
    if (ga) {
      if (!ga.email?.trim() || !ga.password || !ga.displayName?.trim()) {
        throw new BadRequestException("groupAdmin requires email, password, and displayName");
      }
    }

    const ic = dto.initialClinic;
    if (ic && (!ic.nameEn?.trim() || !ic.nameAr?.trim() || !ic.city?.trim())) {
      throw new BadRequestException("initialClinic requires nameEn, nameAr, and city");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tenant.create({
        data: {
          name,
          baseCurrency: dto.baseCurrency?.trim() || "AED",
          defaultLocale: dto.defaultLocale?.trim() || "en",
        },
      });

      let groupAdmin: { id: string; email: string; displayName: string; role: UserRole } | null = null;
      if (ga) {
        const email = ga.email.toLowerCase().trim();
        const clash = await tx.user.findFirst({ where: { email } });
        if (clash) throw new BadRequestException("Email already in use on the platform");
        const u = await tx.user.create({
          data: {
            tenantId: row.id,
            email,
            displayName: ga.displayName.trim(),
            passwordHash: bcrypt.hashSync(ga.password, 10),
            role: UserRole.GROUP_ADMIN,
          },
        });
        groupAdmin = { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
      }

      let initialClinic: { id: string; nameEn: string; kind: "parent" } | null = null;
      if (ic) {
        const c = await tx.clinic.create({
          data: {
            tenantId: row.id,
            nameEn: ic.nameEn.trim(),
            nameAr: ic.nameAr.trim(),
            city: ic.city.trim(),
            country: ic.country?.trim() || "AE",
            addressEn: ic.city.trim(),
            addressAr: ic.city.trim(),
            locationUrl: "https://maps.example.com",
            phone: "+971000000000",
            email: `hq@${row.id.slice(0, 8)}.clinic.local`,
            licenseNumber: "PENDING",
          },
        });
        initialClinic = { id: c.id, nameEn: c.nameEn, kind: "parent" };
      }

      return { row, groupAdmin, initialClinic };
    });

    return {
      id: result.row.id,
      name: result.row.name,
      baseCurrency: result.row.baseCurrency,
      defaultLocale: result.row.defaultLocale,
      createdAt: result.row.createdAt.toISOString(),
      groupAdmin: result.groupAdmin,
      initialClinic: result.initialClinic,
      counts: { users: result.groupAdmin ? 1 : 0, clinics: result.initialClinic ? 1 : 0, patients: 0 },
    };
  }

  async patchTenant(user: JwtUser, tenantId: string, dto: PlatformPatchTenantDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    const data: {
      name?: string;
      baseCurrency?: string;
      defaultLocale?: string;
      defaultVisitFee?: number;
    } = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException("name cannot be empty");
      data.name = n;
    }
    if (dto.baseCurrency !== undefined) data.baseCurrency = dto.baseCurrency.trim();
    if (dto.defaultLocale !== undefined) data.defaultLocale = dto.defaultLocale.trim();
    if (dto.defaultVisitFee !== undefined) data.defaultVisitFee = dto.defaultVisitFee;
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.tenant.update({ where: { id: tenantId }, data });
    return {
      id: row.id,
      name: row.name,
      baseCurrency: row.baseCurrency,
      defaultLocale: row.defaultLocale,
      defaultVisitFee: Number(row.defaultVisitFee),
    };
  }

  listUsers(user: JwtUser, tenantId: string, pageStr?: string, pageSizeStr?: string) {
    this.assertPlatform(user);
    return this.admin.listTenantUsers(tenantId, pageStr, pageSizeStr);
  }

  async listClinics(user: JwtUser, tenantId: string) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
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
    }));
  }

  async createClinic(user: JwtUser, tenantId: string, dto: CreateClinicDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    return this.clinics.create(tenantId, dto);
  }

  async createUser(user: JwtUser, tenantId: string, dto: CreateTenantUserDto) {
    this.assertPlatform(user);
    await this.assertTenant(tenantId);
    if (dto.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException("Cannot assign PLATFORM_SUPER_ADMIN through organization user creation");
    }
    return this.admin.createTenantUser(tenantId, dto);
  }

  listFeatureFlags(user: JwtUser) {
    this.assertPlatform(user);
    return this.admin.listFeatureFlags();
  }

  setFeatureFlag(user: JwtUser, key: string, enabled: boolean) {
    this.assertPlatform(user);
    return this.admin.setFeatureFlag(key, enabled);
  }
}
