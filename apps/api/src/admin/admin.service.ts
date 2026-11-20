import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType, Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { ensureUserEmployeeRecord } from "../common/clinic-staff-employee";
import { assertCanAssignGroupAdminRole, assertCanCreateGroupAdminRole } from "../common/group-admin-role-policy";
import {
  effectiveEmployeeSalaryCurrency,
  normalizeEmployeeSalaryCurrencyOverride,
} from "../common/employee-salary-currency";
import {
  deactivateUserAccount,
  reactivateUserAccount,
  restoreTenantUser,
  softDeleteTenantUser,
} from "../common/user-employee-cascade";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { resolveAuditLogCreatedAtFilter } from "../common/audit-log-query-bounds";
import { paginate, parsePageParams } from "../common/pagination";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import type { JwtUser } from "../auth/jwt-user";
import type { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import type { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import type { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";
import { isBaseCurrency } from "../common/base-currencies";
import { syncInheritedClinicCurrencies } from "../common/sync-inherited-clinic-currencies";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { CLINIC_FLAG_KEYS, getFlagDefinition, isKnownFeatureFlagKey } from "../feature-flags/feature-flag-keys";
import {
  normalizeOrgTaxRegistrationNumber,
  syncClinicInvoiceTaxFromTenant,
} from "../common/sync-clinic-invoice-tax";
import {
  assertTrnForMarket,
  mapTenantTaxSettingsApi,
  requireMarketTaxPack,
  tenantTaxEffectiveFromMarket,
} from "../markets/market-tax-pack";
import type { BulkDeleteUsersDto } from "./dto/bulk-delete-users.dto";
import type { DeactivateTenantUserDto } from "./dto/deactivate-tenant-user.dto";
import type { ReactivateTenantUserDto } from "./dto/reactivate-tenant-user.dto";
import type { PatchUserRolesDto } from "./dto/patch-user-roles.dto";
import type { TransferTenantOwnershipDto } from "./dto/transfer-tenant-ownership.dto";
import { hasAnyRole, hasAnyRoleInSet, hasRole, isTenantOwnerPrincipal, sanitizeAdditionalRoles } from "../common/effective-roles";
import { MfaService, verifyTotpCode } from "../auth/mfa.service";
import {
  buildPlatformHierarchy,
  buildTenantHierarchy,
  resolveVisibleClinicIds,
  type OrgHierarchyNode,
} from "./org-hierarchy";

const CLINIC_SCOPE_ROLES = new Set<UserRole>([UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);

type ClinicSummary = { id: string; nameEn: string };

type LinkedEmployeeSummary = {
  employeeId: string | null;
  employeeNumber: string | null;
  employeeFirstNameEn: string | null;
  employeeLastNameEn: string | null;
  employeeEmploymentType: EmploymentType | null;
  employeeSalaryBase: number | null;
  employeeSalaryCurrency: string | null;
  employeeSalaryCurrencyEffective: string | null;
};

function mapLinkedEmployee(
  employee: {
    id: string;
    employeeNumber: string;
    firstNameEn: string;
    lastNameEn: string;
    employmentType: EmploymentType;
    salaryBase: { toString(): string };
    salaryCurrency: string | null;
    clinic: { defaultCurrency: string };
  } | null,
  orgBaseCurrency: string,
): LinkedEmployeeSummary {
  if (!employee) {
    return {
      employeeId: null,
      employeeNumber: null,
      employeeFirstNameEn: null,
      employeeLastNameEn: null,
      employeeEmploymentType: null,
      employeeSalaryBase: null,
      employeeSalaryCurrency: null,
      employeeSalaryCurrencyEffective: null,
    };
  }
  const effectiveCurrency = effectiveEmployeeSalaryCurrency(employee.salaryCurrency, orgBaseCurrency);
  return {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    employeeFirstNameEn: employee.firstNameEn,
    employeeLastNameEn: employee.lastNameEn,
    employeeEmploymentType: employee.employmentType,
    employeeSalaryBase: Number(employee.salaryBase),
    employeeSalaryCurrency: employee.salaryCurrency,
    employeeSalaryCurrencyEffective: effectiveCurrency,
  };
}

function mapUserClinicAssignments(
  scopes: { clinicId: string; clinic: ClinicSummary }[],
  employee: { clinic: ClinicSummary } | null,
): { clinicIds: string[]; clinics: ClinicSummary[] } {
  const byId = new Map<string, ClinicSummary>();
  for (const s of scopes) byId.set(s.clinic.id, s.clinic);
  if (employee?.clinic && !byId.has(employee.clinic.id)) {
    byId.set(employee.clinic.id, employee.clinic);
  }
  const clinics = [...byId.values()];
  return { clinicIds: clinics.map((c) => c.id), clinics };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly featureFlags: FeatureFlagsService,
    private readonly mfa: MfaService,
  ) {}

  async overview(currentTenantId: string) {
    const [tenant, tenantCount, tenantFeatureFlags, recentAudit] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: currentTenantId }, include: { market: true } }),
      this.prisma.tenant.count(),
      this.featureFlags.listForTenant(currentTenantId),
      this.prisma.auditLog.findMany({
        where: { tenantId: currentTenantId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);
    return {
      currentTenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            baseCurrency: tenant.baseCurrency,
            integrationFailureRetentionDays: tenant.integrationFailureRetentionDays,
            whatsAppRemindersEnabled: tenant.whatsAppRemindersEnabled,
            appointmentReminderHoursBefore: tenant.appointmentReminderHoursBefore,
            ...mapTenantTaxSettingsApi(tenant),
          }
        : null,
      registeredTenants: tenantCount,
      featureFlags: tenantFeatureFlags,
      recentAudit: recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        resource: a.resource,
        resourceId: a.resourceId,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async listTenants(
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    qRaw?: string,
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["name", "createdAt", "baseCurrency"] as const, "name");
    const sortDir = parseSortOrder(sortOrderStr);
    const q = qRaw?.trim() ?? "";
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nameAr: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          nameAr: true,
          baseCurrency: true,
          defaultLocale: true,
          createdAt: true,
          _count: { select: { users: true, clinics: true, patients: true } },
        },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      baseCurrency: r.baseCurrency,
      defaultLocale: r.defaultLocale,
      createdAt: r.createdAt.toISOString(),
      counts: r._count,
    }));
    return paginate(items, total, page, pageSize);
  }

  async listTenantUsers(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    qRaw?: string,
    roleRaw?: string,
    archivedRaw?: string,
  ) {
    await this.assertTenantExists(tenantId);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const archived = archivedRaw === "true" || archivedRaw === "1";
    const where = this.buildTenantUserWhere(tenantId, {
      q: qRaw,
      role: this.parseTenantUserRoleFilter(roleRaw),
      archived,
    });
    const orgBaseCurrency = await this.resolveTenantBaseCurrency(tenantId);
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip,
        take: pageSize,
        include: {
          clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstNameEn: true,
              lastNameEn: true,
              employmentType: true,
              salaryBase: true,
              salaryCurrency: true,
              clinic: { select: { id: true, nameEn: true, defaultCurrency: true } },
            },
          },
        },
      }),
    ]);
    const items = rows.map((r) => {
      const clinics = mapUserClinicAssignments(r.clinicAdminScopes, r.employee);
      return {
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        deactivatedAt: r.deactivatedAt?.toISOString() ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
        archived: Boolean(r.deletedAt || r.deactivatedAt),
        ...clinics,
        ...mapLinkedEmployee(r.employee, orgBaseCurrency),
      };
    });
    return paginate(items, total, page, pageSize);
  }

  private async resolveTenantBaseCurrency(tenantId: string): Promise<string> {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });
    return effectiveEmployeeSalaryCurrency(null, row?.baseCurrency ?? "AED");
  }

  private parseTenantUserRoleFilter(roleRaw?: string): UserRole | undefined {
    const role = roleRaw?.trim();
    if (!role) return undefined;
    if ((Object.values(UserRole) as string[]).includes(role)) return role as UserRole;
    return undefined;
  }

  private buildTenantUserWhere(
    tenantId: string,
    filters?: { q?: string; role?: UserRole; archived?: boolean },
  ): Prisma.UserWhereInput {
    const q = filters?.q?.trim() ?? "";
    const archived = filters?.archived === true;
    return {
      tenantId,
      ...(filters?.role ? { role: filters.role } : {}),
      ...(archived
        ? { OR: [{ deletedAt: { not: null } }, { deactivatedAt: { not: null } }] }
        : { deletedAt: null, deactivatedAt: null }),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  private async assertTenantExists(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!row) throw new NotFoundException("Organization not found");
  }

  private async assertClinicIdsBelongToTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clinicIds: string[],
  ): Promise<void> {
    for (const cid of clinicIds) {
      const c = await tx.clinic.findFirst({ where: { id: cid, tenantId } });
      if (!c) throw new BadRequestException(`Invalid clinicId: ${cid}`);
    }
  }

  private async syncClinicAdminScopes(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    clinicIds: string[],
  ): Promise<void> {
    await tx.clinicAdminScope.deleteMany({ where: { tenantId, userId } });
    if (!clinicIds.length) return;
    await this.assertClinicIdsBelongToTenant(tx, tenantId, clinicIds);
    await tx.clinicAdminScope.createMany({
      data: clinicIds.map((clinicId) => ({ tenantId, userId, clinicId })),
      skipDuplicates: true,
    });
  }

  async listFeatureFlags() {
    const rows = await this.prisma.featureFlag.findMany({ where: { key: { in: [...CLINIC_FLAG_KEYS] } } });
    const idByKey = new Map(rows.map((r) => [r.key, r.id]));
    const views = await this.featureFlags.listGlobal();
    return views.map((v) => ({
      id: idByKey.get(v.key) ?? v.key,
      key: v.key,
      enabled: v.globalEnabled,
      description: v.description,
      descriptionAr: v.descriptionAr,
      class: v.class,
      scopes: v.scopes,
      dependsOn: v.dependsOn,
      launchLocked: v.launchLocked,
      awaitingGate: v.awaitingGate,
      source: v.source,
      managed: v.managed,
    }));
  }

  /** FF05: banner + freshness for the platform flag pages. */
  featureFlagStatus() {
    return { managed: this.featureFlags.isManaged(), snapshot: this.featureFlags.snapshotMeta() };
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto, actor?: JwtUser) {
    const email = dto.email.toLowerCase().trim();
    if (hasRole(dto, UserRole.PLATFORM_SUPER_ADMIN)) {
      throw new BadRequestException("Cannot create platform super administrators through this endpoint");
    }
    assertCanCreateGroupAdminRole(dto.role, actor);
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new BadRequestException("Email already in use for this organization");
    if (hasAnyRoleInSet(dto, CLINIC_SCOPE_ROLES) && !(dto.clinicIds?.length ?? 0)) {
      throw new BadRequestException("clinicIds is required when creating a clinic administrator or branch manager");
    }
    const passwordHash = bcrypt.hashSync(dto.password, 10);
    const clinicIds = dto.clinicIds ?? [];
    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId,
          email,
          displayName: dto.displayName.trim(),
          passwordHash,
          role: dto.role,
        },
      });
      if (clinicIds.length) {
        await this.syncClinicAdminScopes(tx, tenantId, u.id, clinicIds);
      }
      await ensureUserEmployeeRecord(tx, tenantId, u, clinicIds[0] ?? null);
      return u;
    });
    return this.getTenantUser(tenantId, row.id);
  }

  async getTenantUser(tenantId: string, userId: string) {
    await this.assertTenantExists(tenantId);
    const row = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        tenant: { select: { id: true, name: true, baseCurrency: true } },
        clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstNameEn: true,
            lastNameEn: true,
            employmentType: true,
            salaryBase: true,
            salaryCurrency: true,
            clinic: { select: { id: true, nameEn: true, defaultCurrency: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("User not found");
    const orgBaseCurrency = effectiveEmployeeSalaryCurrency(null, row.tenant?.baseCurrency ?? "AED");
    const clinics = mapUserClinicAssignments(row.clinicAdminScopes, row.employee);
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant?.name ?? null,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      additionalRoles: row.additionalRoles ?? [],
      isTenantOwner: Boolean(row.isTenantOwner),
      createdAt: row.createdAt.toISOString(),
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      archived: Boolean(row.deletedAt || row.deactivatedAt),
      ...clinics,
      ...mapLinkedEmployee(row.employee, orgBaseCurrency),
    };
  }

  private async resetUserAccessForPrimaryRoleChange(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    await tx.userNavTabGrant.deleteMany({ where: { tenantId, userId } });
    await tx.userMoneyVisibilityOverride.deleteMany({ where: { tenantId, userId } });
    await tx.userClinicEmployeePrivilegeGrant.deleteMany({ where: { tenantId, userId } });
  }

  async updateTenantUser(tenantId: string, userId: string, dto: PlatformPatchTenantUserDto, actor?: JwtUser) {
    await this.assertTenantExists(tenantId);
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new NotFoundException("User not found");
    const nextRoleCandidate = dto.role ?? existing.role;
    if (
      hasRole(existing, UserRole.PLATFORM_SUPER_ADMIN) ||
      nextRoleCandidate === UserRole.PLATFORM_SUPER_ADMIN
    ) {
      throw new BadRequestException("Cannot modify platform super administrators through this endpoint");
    }

    const nextRole = dto.role ?? existing.role;
    if (dto.role !== undefined) {
      assertCanAssignGroupAdminRole(existing.role, nextRole, actor);
    }
    if (nextRole === UserRole.CLINIC_ADMIN || nextRole === UserRole.BRANCH_MANAGER) {
      if (dto.clinicIds !== undefined && !dto.clinicIds.length) {
        throw new BadRequestException("clinicIds is required for clinic administrator or branch manager");
      }
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const clash = await this.prisma.user.findFirst({ where: { tenantId, email, NOT: { id: userId } } });
      if (clash) throw new BadRequestException("Email already in use for this organization");
    }

    const roleChanged = dto.role !== undefined && dto.role !== existing.role;

    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(roleChanged ? { additionalRoles: [] } : {}),
          ...(dto.password !== undefined ? { passwordHash: bcrypt.hashSync(dto.password, 10) } : {}),
        },
      });

      if (roleChanged) {
        await this.resetUserAccessForPrimaryRoleChange(tx, tenantId, userId);
      }

      if (dto.clinicIds !== undefined) {
        await this.syncClinicAdminScopes(tx, tenantId, userId, dto.clinicIds);
      }

      const shouldSyncEmployee =
        dto.clinicIds !== undefined ||
        dto.role !== undefined ||
        dto.email !== undefined ||
        dto.displayName !== undefined;
      if (shouldSyncEmployee) {
        const primaryClinic = dto.clinicIds !== undefined ? (dto.clinicIds[0] ?? null) : undefined;
        await ensureUserEmployeeRecord(tx, tenantId, u, primaryClinic);
      }

      if (dto.employmentType !== undefined || dto.salaryBase !== undefined || dto.salaryCurrency !== undefined) {
        const emp = await tx.employee.findFirst({
          where: { tenantId, userId },
        });
        if (emp) {
          const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { baseCurrency: true },
          });
          const orgBaseCurrency = effectiveEmployeeSalaryCurrency(null, tenant?.baseCurrency ?? "AED");
          let salaryCurrency: string | null | undefined;
          if (dto.salaryCurrency !== undefined) {
            salaryCurrency = normalizeEmployeeSalaryCurrencyOverride(orgBaseCurrency, dto.salaryCurrency);
          }
          await tx.employee.update({
            where: { id: emp.id },
            data: {
              ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
              ...(dto.salaryBase !== undefined ? { salaryBase: dto.salaryBase } : {}),
              ...(salaryCurrency !== undefined ? { salaryCurrency } : {}),
            },
          });
        }
      }

      return u;
    });

    if (roleChanged && actor?.userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actor.userId,
          action: "USER_PRIMARY_ROLE_CHANGED",
          resource: "user",
          resourceId: userId,
          metadata: { previousRole: existing.role, newRole: row.role },
        },
      });
    }

    return this.getTenantUser(tenantId, row.id);
  }

  async deleteTenantUser(tenantId: string, userId: string, actor: JwtUser) {
    await this.assertTenantExists(tenantId);
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new NotFoundException("User not found");
    if (hasRole(existing, UserRole.PLATFORM_SUPER_ADMIN)) {
      throw new BadRequestException("Cannot archive platform super administrators");
    }
    if (actor.userId === userId) {
      throw new BadRequestException("You cannot archive your own account");
    }

    await this.prisma.$transaction(async (tx) => {
      await softDeleteTenantUser(tx, tenantId, userId, actor.userId);
    });
    return { ok: true, id: userId, archived: true };
  }

  async deactivateTenantUser(tenantId: string, userId: string, dto: DeactivateTenantUserDto, actor: JwtUser) {
    await this.assertTenantExists(tenantId);
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new NotFoundException("User not found");
    if (hasRole(existing, UserRole.PLATFORM_SUPER_ADMIN)) {
      throw new BadRequestException("Cannot deactivate platform super administrators");
    }
    if (actor.userId === userId) {
      throw new BadRequestException("You cannot deactivate your own account");
    }
    const resignationDate = dto.resignationDate ? new Date(dto.resignationDate) : new Date();
    resignationDate.setHours(0, 0, 0, 0);
    await this.prisma.$transaction(async (tx) => {
      await deactivateUserAccount(tx, tenantId, userId, resignationDate);
    });
    return this.getTenantUser(tenantId, userId);
  }

  async reactivateTenantUser(tenantId: string, userId: string, dto: ReactivateTenantUserDto) {
    await this.assertTenantExists(tenantId);
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);
    await this.prisma.$transaction(async (tx) => {
      await reactivateUserAccount(tx, tenantId, userId, startDate);
    });
    return this.getTenantUser(tenantId, userId);
  }

  async restoreTenantUserAccount(tenantId: string, userId: string, dto: ReactivateTenantUserDto) {
    await this.assertTenantExists(tenantId);
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);
    await this.prisma.$transaction(async (tx) => {
      await restoreTenantUser(tx, tenantId, userId, startDate);
    });
    return this.getTenantUser(tenantId, userId);
  }

  async deleteTenantUsersBulk(tenantId: string, dto: BulkDeleteUsersDto, actor: JwtUser) {
    await this.assertTenantExists(tenantId);
    let ids: string[];
    if (dto.all) {
      const rows = await this.prisma.user.findMany({
        where: this.buildTenantUserWhere(tenantId, {
          q: dto.search,
          role: this.parseTenantUserRoleFilter(dto.role),
        }),
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    } else {
      ids = [...new Set((dto.ids ?? []).map((id) => id.trim()).filter(Boolean))];
      if (!ids.length) throw new BadRequestException("ids required unless all=true");
    }

    ids = ids.filter((id) => id !== actor.userId);
    let deleted = 0;
    const failed: { id: string; message: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteTenantUser(tenantId, id, actor);
        deleted += 1;
      } catch (e) {
        const message =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? String(e.message)
            : e instanceof Error
              ? e.message
              : "Delete failed";
        failed.push({ id, message });
      }
    }

    return { ok: true, deleted, failed };
  }

  async auditLogs(
    tenantId: string,
    pageStr: string | undefined,
    pageSizeStr: string | undefined,
    qRaw: string | undefined,
    user: JwtUser,
    filters?: { from?: string; to?: string; action?: string; resource?: string; actorId?: string },
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) && !hasRole(user, UserRole.CLINIC_ADMIN) && !hasRole(user, UserRole.BRANCH_MANAGER)) {
      throw new ForbiddenException("Only administrators may list audit logs");
    }
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const q = qRaw?.trim() ?? "";
    let scopeClinicIds: string[] | null = null;
    const auditScope = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (auditScope !== null) {
      scopeClinicIds = auditScope;
      if (!scopeClinicIds.length) {
        return paginate([], 0, page, pageSize);
      }
    }
    const qBounded = q.slice(0, 200);
    const createdAt = resolveAuditLogCreatedAtFilter(filters?.from, filters?.to);

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(scopeClinicIds
        ? {
            OR: [{ clinicId: { in: scopeClinicIds } }, { clinicId: null }],
          }
        : {}),
      createdAt,
      ...(filters?.action ? { action: { contains: filters.action, mode: "insensitive" } } : {}),
      ...(filters?.resource ? { resource: { contains: filters.resource, mode: "insensitive" } } : {}),
      ...(filters?.actorId ? { actorId: filters.actorId } : {}),
      ...(qBounded
        ? {
            OR: [
              { action: { contains: qBounded, mode: "insensitive" } },
              { resource: { contains: qBounded, mode: "insensitive" } },
              { resourceId: { contains: qBounded, mode: "insensitive" } },
              { patientMrn: { contains: qBounded, mode: "insensitive" } },
              { actor: { is: { displayName: { contains: qBounded, mode: "insensitive" } } } },
              { actor: { is: { email: { contains: qBounded, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { actor: { select: { displayName: true, email: true, role: true } } },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      patientId: r.patientId,
      patientMrn: r.patientMrn,
      clinicId: r.clinicId,
      createdAt: r.createdAt.toISOString(),
      actorDisplayName: r.actor?.displayName ?? null,
      actorEmail: r.actor?.email ?? null,
      actorRole: r.actor?.role ?? null,
      metadata: r.metadata === null ? null : (r.metadata as Record<string, unknown>),
    }));
    return paginate(items, total, page, pageSize);
  }

  async patchTenantSettings(tenantId: string, user: import("../auth/jwt-user").JwtUser, dto: PatchTenantSettingsDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { market: true },
    });
    if (!existing) throw new NotFoundException("Tenant not found");
    if (!existing.market) throw new BadRequestException("Organization has no country market assigned");
    const marketPack = requireMarketTaxPack(existing.market);

    const data: {
      defaultVisitFee?: number | null;
      baseCurrency?: string;
      integrationFailureRetentionDays?: number;
      defaultTaxRegistrationNumber?: string | null;
      defaultInvoiceVatPercent?: number | null;
      whatsAppRemindersEnabled?: boolean;
      appointmentReminderHoursBefore?: number;
    } = {};
    if (dto.defaultVisitFeeUseMarketDefault) data.defaultVisitFee = null;
    else if (dto.defaultVisitFee !== undefined) data.defaultVisitFee = dto.defaultVisitFee;
    if (dto.baseCurrency !== undefined) {
      const next = dto.baseCurrency.trim();
      if (!isBaseCurrency(next)) throw new BadRequestException("Invalid base currency");
      data.baseCurrency = next;
    }
    if (dto.integrationFailureRetentionDays !== undefined) {
      data.integrationFailureRetentionDays = dto.integrationFailureRetentionDays;
    }
    if (dto.defaultTaxRegistrationNumberUseMarketDefault) {
      data.defaultTaxRegistrationNumber = null;
    } else if (dto.defaultTaxRegistrationNumber !== undefined) {
      data.defaultTaxRegistrationNumber = normalizeOrgTaxRegistrationNumber(dto.defaultTaxRegistrationNumber);
    }
    if (dto.defaultInvoiceVatPercentUseMarketDefault) {
      data.defaultInvoiceVatPercent = null;
    } else if (dto.defaultInvoiceVatPercent !== undefined) {
      if (dto.defaultInvoiceVatPercent < 0 || dto.defaultInvoiceVatPercent > 100) {
        throw new BadRequestException("VAT percent must be between 0 and 100");
      }
      data.defaultInvoiceVatPercent = dto.defaultInvoiceVatPercent;
    }

    const trnAfterPatch =
      data.defaultTaxRegistrationNumber !== undefined
        ? data.defaultTaxRegistrationNumber
        : existing.defaultTaxRegistrationNumber;
    if (data.defaultTaxRegistrationNumber !== undefined) {
      assertTrnForMarket(trnAfterPatch, marketPack);
    }
    if (dto.whatsAppRemindersEnabled !== undefined) data.whatsAppRemindersEnabled = dto.whatsAppRemindersEnabled;
    if (dto.appointmentReminderHoursBefore !== undefined) {
      data.appointmentReminderHoursBefore = dto.appointmentReminderHoursBefore;
    }
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    if (dto.whatsAppRemindersEnabled !== undefined) {
      await this.featureFlags.setTenantFlag(tenantId, "whatsapp_reminders", dto.whatsAppRemindersEnabled);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({ where: { id: tenantId }, data });
      if (data.baseCurrency && data.baseCurrency !== existing.baseCurrency) {
        await syncInheritedClinicCurrencies(tx, tenantId, existing.baseCurrency, data.baseCurrency);
      }
      if (
        data.defaultTaxRegistrationNumber !== undefined ||
        data.defaultInvoiceVatPercent !== undefined
      ) {
        const merged = { ...existing, ...updated };
        const effective = tenantTaxEffectiveFromMarket(existing.market!, merged);
        await syncClinicInvoiceTaxFromTenant(
          tx,
          tenantId,
          effective.defaultTaxRegistrationNumber,
          effective.defaultInvoiceVatPercent,
        );
      }
      return updated;
    });

    const withMarket = await this.prisma.tenant.findUnique({
      where: { id: row.id },
      include: { market: true },
    });
    if (!withMarket) throw new NotFoundException("Tenant not found");
    return {
      id: withMarket.id,
      name: withMarket.name,
      baseCurrency: withMarket.baseCurrency,
      integrationFailureRetentionDays: withMarket.integrationFailureRetentionDays,
      whatsAppRemindersEnabled: withMarket.whatsAppRemindersEnabled,
      appointmentReminderHoursBefore: withMarket.appointmentReminderHoursBefore,
      ...mapTenantTaxSettingsApi(withMarket),
    };
  }

  async setFeatureFlag(key: string, enabled: boolean) {
    this.featureFlags.assertNotManaged();
    const def = getFlagDefinition(key);
    if (!def) throw new NotFoundException("Feature flag not found");
    return this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description: def.descriptionEn },
      update: { enabled },
    });
  }

  async setTenantFeatureFlag(tenantId: string, key: string, enabled: boolean) {
    if (!isKnownFeatureFlagKey(key)) throw new BadRequestException("Unknown feature flag key");
    await this.featureFlags.setTenantFlag(tenantId, key, enabled);
    return this.featureFlags.listForTenant(tenantId);
  }

  async getOrgHierarchyForUser(user: JwtUser, tenantId: string): Promise<OrgHierarchyNode> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const visible = await resolveVisibleClinicIds(this.prisma, tenantId, scopeIds);
    return buildTenantHierarchy(this.prisma, tenantId, visible);
  }

  getPlatformHierarchy(tenantIdFilter?: string): Promise<OrgHierarchyNode> {
    return buildPlatformHierarchy(this.prisma, tenantIdFilter);
  }

  async patchUserAdditionalRoles(
    tenantId: string,
    userId: string,
    actor: JwtUser,
    dto: PatchUserRolesDto,
  ) {
    if (!hasAnyRole(actor, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN]) || actor.tenantId !== tenantId) {
      throw new ForbiddenException("Not allowed to manage user roles");
    }
    const target = await this.prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null } });
    if (!target) throw new NotFoundException("User not found");
    const additionalRoles = sanitizeAdditionalRoles(target.role, dto.additionalRoles);
    if (additionalRoles.length > 3) {
      throw new BadRequestException("Too many additional roles for current plan");
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { additionalRoles },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.userId,
        action: "USER_ADDITIONAL_ROLES_UPDATED",
        resource: "user",
        resourceId: userId,
        metadata: { additionalRoles, primaryRole: updated.role },
      },
    });
    return this.getTenantUser(tenantId, userId);
  }

  async transferTenantOwnership(
    tenantId: string,
    actor: JwtUser,
    dto: TransferTenantOwnershipDto,
  ) {
    if (!isTenantOwnerPrincipal(actor) && !hasRole(actor, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only the tenant owner may transfer ownership");
    }
  const actorRow = await this.prisma.user.findFirst({
      where: { id: actor.userId, tenantId, deletedAt: null },
      select: { mfaEnabled: true, mfaTotpSecret: true, isTenantOwner: true },
    });
    if (!actorRow?.isTenantOwner && !hasRole(actor, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only the tenant owner may transfer ownership");
    }
    if (actorRow?.mfaEnabled) {
      const code = dto.mfaCode?.trim();
      if (!code) throw new BadRequestException("mfaCode is required");
      const ok = verifyTotpCode(actorRow.mfaTotpSecret, code);
      if (!ok) {
        const recovery = await this.mfa.consumeRecoveryCode(actor.userId, code);
        if (!recovery) throw new BadRequestException("Invalid MFA code");
      }
    }
    const next = await this.prisma.user.findFirst({
      where: { id: dto.toUserId.trim(), tenantId, deletedAt: null, deactivatedAt: null },
    });
    if (!next) throw new NotFoundException("Target user not found");
    if (next.id === actor.userId) throw new BadRequestException("Already the tenant owner");

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { tenantId, isTenantOwner: true }, data: { isTenantOwner: false } });
      await tx.user.update({ where: { id: next.id }, data: { isTenantOwner: true } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.userId,
          action: "TENANT_OWNERSHIP_TRANSFERRED",
          resource: "tenant",
          resourceId: tenantId,
          metadata: { fromUserId: actor.userId, toUserId: next.id },
        },
      });
    });
    return { ok: true as const, ownerUserId: next.id };
  }
}
