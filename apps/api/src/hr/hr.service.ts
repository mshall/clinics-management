import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AttendanceStatus, EmployeeRecordStatus, EmployeeSeparationReason, LeaveStatus, Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "crypto";
import * as path from "path";
import type { JwtUser } from "../auth/jwt-user";
import { ensureClinicStaffEmployeeRecords, jobTitleForRole } from "../common/clinic-staff-employee";
import {
  deactivateUserForEmployee,
  reactivateUserForEmployee,
  restoreEmployee,
  softDeleteLinkedEmployee,
  syncUserClinicAdminScopes,
} from "../common/user-employee-cascade";
import { CLINIC_SCOPE_ROLES, fetchClinicScopeIds } from "../common/clinic-scope";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import type { CreateAttendanceDto } from "./dto/create-attendance.dto";
import type { CreateEmployeeDto } from "./dto/create-employee.dto";
import type { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto";
import type { UnlinkedUserDto } from "./dto/unlinked-user.dto";
import type { AttendanceDto } from "./dto/attendance.dto";
import type { DeactivateEmployeeDto } from "./dto/deactivate-employee.dto";
import type { EmployeeEmploymentPeriodDto } from "./dto/employee-employment-period.dto";
import type { ReactivateEmployeeDto } from "./dto/reactivate-employee.dto";
import type { EmployeeDto } from "./dto/employee.dto";
import type { LeaveRequestDto } from "./dto/leave-request.dto";

const MAX_ID_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_ID_DOC_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

type IdDocFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

const EMPLOYEE_MANAGE_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.HR_OFFICER,
  UserRole.BRANCH_MANAGER,
]);

const EMPLOYEE_DELETE_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private assertCanManageEmployees(viewer: JwtUser): void {
    if (!EMPLOYEE_MANAGE_ROLES.has(viewer.role)) {
      throw new ForbiddenException("You do not have permission to manage employees");
    }
  }

  private assertCanDeleteEmployee(viewer: JwtUser): void {
    if (!EMPLOYEE_DELETE_ROLES.has(viewer.role)) {
      throw new ForbiddenException("Only administrators can delete employees");
    }
  }

  private async assertClinicAdminCanUseClinic(tenantId: string, viewer: JwtUser, clinicId: string): Promise<void> {
    if (!CLINIC_SCOPE_ROLES.has(viewer.role)) return;
    const scope = await this.prisma.clinicAdminScope.findFirst({
      where: { tenantId, userId: viewer.userId, clinicId },
    });
    if (!scope) throw new ForbiddenException("Clinic is outside your assignment");
  }

  private async nextEmployeeNumber(tenantId: string): Promise<string> {
    const rows = await this.prisma.employee.findMany({
      where: { tenantId, employeeNumber: { startsWith: "EMP-" } },
      select: { employeeNumber: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /^EMP-(\d+)$/i.exec(r.employeeNumber.trim());
      if (m) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    return `EMP-${max + 1}`;
  }

  private mapEmploymentPeriod(p: {
    id: string;
    startDate: Date;
    endDate: Date | null;
    separationReason: EmployeeSeparationReason | null;
  }): EmployeeEmploymentPeriodDto {
    return {
      id: p.id,
      startDate: p.startDate.toISOString().slice(0, 10),
      endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
      separationReason: p.separationReason,
    };
  }

  private mapEmployee(e: {
    id: string;
    clinicId: string;
    employeeNumber: string;
    firstNameEn: string;
    lastNameEn: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
    email: string | null;
    phone: string;
    jobTitle: string;
    employmentType: EmployeeDto["employmentType"];
    hireDate: Date;
    salaryBase: { toString(): string };
    userId: string | null;
    recordStatus: EmployeeRecordStatus;
    resignationDate: Date | null;
    separationReason: EmployeeSeparationReason | null;
    createdAt: Date;
    deletedAt: Date | null;
    idDocRelativePath?: string | null;
    clinic?: { nameEn: string; nameAr: string } | null;
    user?: {
      displayName: string;
      role: string;
      avatarRelativePath: string | null;
      createdAt: Date;
      deactivatedAt: Date | null;
      deletedAt: Date | null;
      clinicAdminScopes?: { clinicId: string }[];
    } | null;
    employmentPeriods?: {
      id: string;
      startDate: Date;
      endDate: Date | null;
      separationReason: EmployeeSeparationReason | null;
    }[];
  }): EmployeeDto {
    const periods = (e.employmentPeriods ?? []).map((p) => this.mapEmploymentPeriod(p));
    return {
      id: e.id,
      clinicId: e.clinicId,
      clinicNameEn: e.clinic?.nameEn ?? null,
      clinicNameAr: e.clinic?.nameAr ?? null,
      employeeNumber: e.employeeNumber,
      firstNameEn: e.firstNameEn,
      lastNameEn: e.lastNameEn,
      firstNameAr: e.firstNameAr,
      lastNameAr: e.lastNameAr,
      email: e.email,
      phone: e.phone,
      jobTitle: e.jobTitle,
      employmentType: e.employmentType,
      hireDate: e.hireDate.toISOString().slice(0, 10),
      salaryBase: Number(e.salaryBase),
      userId: e.userId,
      hasIdDoc: Boolean(e.idDocRelativePath),
      linkedUserDisplayName: e.user?.displayName ?? null,
      linkedUserRole: e.user?.role ?? null,
      linkedUserClinicIds: this.mapLinkedUserClinicIds(e.user, e.clinicId),
      hasUserAvatar: Boolean(e.user?.avatarRelativePath),
      recordStatus: e.recordStatus,
      resignationDate: e.resignationDate ? e.resignationDate.toISOString().slice(0, 10) : null,
      separationReason: e.separationReason,
      createdAt: e.createdAt.toISOString(),
      deletedAt: e.deletedAt?.toISOString() ?? null,
      archived: Boolean(e.deletedAt || e.recordStatus === EmployeeRecordStatus.INACTIVE),
      linkedUserCreatedAt: e.user?.createdAt?.toISOString() ?? null,
      linkedUserDeactivatedAt: e.user?.deactivatedAt?.toISOString() ?? null,
      linkedUserDeletedAt: e.user?.deletedAt?.toISOString() ?? null,
      employmentPeriods: periods,
    };
  }

  private employeeInclude = {
    clinic: { select: { nameEn: true, nameAr: true } },
    user: {
      select: {
        displayName: true,
        role: true,
        avatarRelativePath: true,
        createdAt: true,
        deactivatedAt: true,
        deletedAt: true,
        clinicAdminScopes: { select: { clinicId: true } },
      },
    },
    employmentPeriods: { orderBy: { startDate: "asc" as const } },
  } satisfies Prisma.EmployeeInclude;

  private mapLinkedUserClinicIds(
    user?: { clinicAdminScopes?: { clinicId: string }[] } | null,
    employeeClinicId?: string,
  ): string[] {
    const ids = new Set<string>();
    for (const s of user?.clinicAdminScopes ?? []) ids.add(s.clinicId);
    if (employeeClinicId) ids.add(employeeClinicId);
    return [...ids];
  }

  private async ensureEmployeeEmploymentPeriods(tenantId: string): Promise<void> {
    const missing = await this.prisma.employee.findMany({
      where: { tenantId, employmentPeriods: { none: {} } },
      select: { id: true, hireDate: true, recordStatus: true, resignationDate: true, separationReason: true },
      take: 200,
    });
    if (!missing.length) return;
    await this.prisma.$transaction(
      missing.map((emp) =>
        this.prisma.employeeEmploymentPeriod.create({
          data: {
            employeeId: emp.id,
            startDate: emp.hireDate,
            endDate: emp.recordStatus === EmployeeRecordStatus.INACTIVE ? emp.resignationDate : null,
            separationReason:
              emp.recordStatus === EmployeeRecordStatus.INACTIVE ? emp.separationReason : null,
          },
        }),
      ),
    );
  }

  private mapAttendance(
    a: {
      id: string;
      employeeId: string;
      workDate: Date;
      clockIn: Date | null;
      clockOut: Date | null;
      status: AttendanceStatus;
      notes: string | null;
    },
    emp?: {
      employeeNumber: string;
      firstNameEn: string;
      lastNameEn: string;
      firstNameAr: string | null;
      lastNameAr: string | null;
      clinic?: { nameEn: string } | null;
    } | null
  ): AttendanceDto {
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeNumber: emp?.employeeNumber ?? null,
      employeeFullName: emp ? `${emp.firstNameEn} ${emp.lastNameEn}`.trim() : null,
      employeeFirstNameEn: emp?.firstNameEn ?? null,
      employeeLastNameEn: emp?.lastNameEn ?? null,
      employeeFirstNameAr: emp?.firstNameAr ?? null,
      employeeLastNameAr: emp?.lastNameAr ?? null,
      clinicNameEn: emp?.clinic?.nameEn ?? null,
      workDate: a.workDate.toISOString().slice(0, 10),
      clockIn: a.clockIn ? a.clockIn.toISOString() : null,
      clockOut: a.clockOut ? a.clockOut.toISOString() : null,
      status: a.status,
      notes: a.notes,
    };
  }

  private mapLeave(l: {
    id: string;
    employeeId: string;
    type: LeaveRequestDto["type"];
    startDate: Date;
    endDate: Date;
    status: LeaveRequestDto["status"];
    reason: string | null;
  }): LeaveRequestDto {
    return {
      id: l.id,
      employeeId: l.employeeId,
      type: l.type,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      status: l.status,
      reason: l.reason,
    };
  }

  async listEmployees(
    tenantId: string,
    viewer: JwtUser,
    pageStr?: string,
    pageSizeStr?: string,
    search?: string,
    clinicIdStr?: string,
    nameFilterStr?: string,
    clinicFilterStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    recordStatusStr?: string,
    archivedStr?: string,
  ) {
    await ensureClinicStaffEmployeeRecords(this.prisma, tenantId);
    await this.ensureEmployeeEmploymentPeriods(tenantId);
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(pageStr, pageSizeStr);
      return paginate([], 0, page, pageSize);
    }
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const legacySearch = search?.trim();
    const nameFilter = (nameFilterStr ?? legacySearch)?.trim();
    const clinicFilter = clinicFilterStr?.trim();
    const clinicId = clinicIdStr?.trim();

    const and: Prisma.EmployeeWhereInput[] = [{ tenantId }];
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assignment");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }
    if (nameFilter) {
      and.push({
        OR: [
          { employeeNumber: { contains: nameFilter, mode: "insensitive" } },
          { firstNameEn: { contains: nameFilter, mode: "insensitive" } },
          { lastNameEn: { contains: nameFilter, mode: "insensitive" } },
          { firstNameAr: { contains: nameFilter, mode: "insensitive" } },
          { lastNameAr: { contains: nameFilter, mode: "insensitive" } },
          { email: { contains: nameFilter, mode: "insensitive" } },
          { user: { is: { displayName: { contains: nameFilter, mode: "insensitive" } } } },
          { user: { is: { email: { contains: nameFilter, mode: "insensitive" } } } },
        ],
      });
    }
    if (clinicFilter) {
      and.push({ clinic: { nameEn: { contains: clinicFilter, mode: "insensitive" } } });
    }
    const recordStatus = recordStatusStr?.trim().toUpperCase();
    if (recordStatus && (Object.values(EmployeeRecordStatus) as string[]).includes(recordStatus)) {
      and.push({ recordStatus: recordStatus as EmployeeRecordStatus });
    }
    const archived = archivedStr === "true" || archivedStr === "1";
    if (archived) {
      and.push({ OR: [{ deletedAt: { not: null } }, { recordStatus: EmployeeRecordStatus.INACTIVE }] });
    } else {
      and.push({ deletedAt: null, recordStatus: EmployeeRecordStatus.ACTIVE });
    }
    const where: Prisma.EmployeeWhereInput = and.length > 1 ? { AND: and } : { tenantId };
    const sortField = pickSortField(sortByStr, ["employeeNumber", "lastNameEn", "hireDate", "salaryBase", "jobTitle"] as const, "lastNameEn");
    const sortDir = parseSortOrder(sortOrderStr);
    const [total, rows] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: this.employeeInclude,
      }),
    ]);
    return paginate(rows.map((r) => this.mapEmployee(r)), total, page, pageSize);
  }

  async getEmployee(tenantId: string, id: string, viewer: JwtUser): Promise<EmployeeDto> {
    await this.ensureEmployeeEmploymentPeriods(tenantId);
    const row = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: this.employeeInclude,
    });
    if (!row) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, row.clinicId);
    return this.mapEmployee(row);
  }

  async listUnlinkedUsers(tenantId: string, viewer: JwtUser, search?: string): Promise<UnlinkedUserDto[]> {
    this.assertCanManageEmployees(viewer);
    const q = search?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        deactivatedAt: null,
        role: { not: UserRole.PLATFORM_SUPER_ADMIN },
        employee: { is: null },
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { displayName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { displayName: "asc" },
      take: 100,
      select: { id: true, email: true, displayName: true, role: true },
    });
    return rows;
  }

  async createEmployee(tenantId: string, dto: CreateEmployeeDto, viewer: JwtUser): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);

    const userId = dto.userId?.trim();
    if (!userId) throw new BadRequestException("userId is required — link an organization login account");

    const linkedUser = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, email: true, displayName: true, role: true },
    });
    if (!linkedUser) {
      throw new BadRequestException("Invalid userId — user not found in this organization");
    }
    const alreadyLinked = await this.prisma.employee.findFirst({
      where: { userId: linkedUser.id },
      select: { id: true },
    });
    if (alreadyLinked) {
      throw new BadRequestException("This login account is already linked to an employee");
    }

    const clinicIds = [
      ...new Set(
        [dto.clinicId?.trim(), ...(dto.clinicIds ?? []).map((id) => id.trim())].filter(Boolean) as string[],
      ),
    ];
    if (!clinicIds.length) throw new BadRequestException("Clinic is required");
    const primaryClinicId = clinicIds[0]!;
    for (const clinicId of clinicIds) {
      await this.assertClinicAdminCanUseClinic(tenantId, viewer, clinicId);
      const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
      if (!clinic) throw new BadRequestException(`Invalid clinicId: ${clinicId}`);
    }

    const phone = dto.phone.replace(/\D/g, "");
    if (phone.length < 8) throw new BadRequestException("Phone must contain at least 8 digits");
    const employeeNumber = await this.nextEmployeeNumber(tenantId);
    const email = dto.email?.trim() || linkedUser.email || null;
    const jobTitle = dto.jobTitle?.trim() || jobTitleForRole(linkedUser.role);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: {
            tenantId,
            clinicId: primaryClinicId,
            userId: linkedUser.id,
            employeeNumber,
            firstNameEn: dto.firstNameEn,
            lastNameEn: dto.lastNameEn,
            firstNameAr: dto.firstNameAr?.trim() || null,
            lastNameAr: dto.lastNameAr?.trim() || null,
            email,
            phone,
            jobTitle,
            employmentType: dto.employmentType,
            hireDate: new Date(dto.hireDate),
            salaryBase: dto.salaryBase,
          },
        });
        if (clinicIds.length > 0) {
          await syncUserClinicAdminScopes(tx, tenantId, linkedUser.id, clinicIds);
        }
        await tx.employeeEmploymentPeriod.create({
          data: {
            employeeId: created.id,
            startDate: created.hireDate,
          },
        });
        return created;
      });
      const withClinic = await this.prisma.employee.findFirst({
        where: { id: row.id },
        include: this.employeeInclude,
      });
      return this.mapEmployee(withClinic!);
    } catch {
      throw new BadRequestException("Duplicate employee number or invalid data");
    }
  }

  async attachEmployeeIdDocument(tenantId: string, employeeId: string, viewer: JwtUser, file?: IdDocFile): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_ID_DOC_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_ID_DOC_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);
    const docId = randomUUID();
    const base = path.basename(file.originalname || "id").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "id";
    const relativePath = `${tenantId}/${employeeId}/${docId}-${base}`;
    await this.uploads.put("employees", relativePath, file.buffer, mime);
    const row = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        idDocRelativePath: relativePath,
        idDocOriginalName: file.originalname || base,
        idDocMimeType: mime,
      },
      include: this.employeeInclude,
    });
    return this.mapEmployee(row);
  }

  async updateEmployee(tenantId: string, id: string, dto: UpdateEmployeeDto, viewer: JwtUser): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);
    const existing = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!existing) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, existing.clinicId);

    const clinicIdsFromDto = dto.clinicIds?.map((cid) => cid.trim()).filter(Boolean);
    const clinicId = dto.clinicId?.trim();
    const resolvedClinicIds =
      clinicIdsFromDto !== undefined
        ? [...new Set(clinicIdsFromDto)]
        : clinicId
          ? [clinicId]
          : undefined;

    if (resolvedClinicIds?.length) {
      for (const cid of resolvedClinicIds) {
        await this.assertClinicAdminCanUseClinic(tenantId, viewer, cid);
        const clinic = await this.prisma.clinic.findFirst({ where: { id: cid, tenantId } });
        if (!clinic) throw new BadRequestException(`Invalid clinicId: ${cid}`);
      }
    } else if (clinicId && clinicId !== existing.clinicId) {
      await this.assertClinicAdminCanUseClinic(tenantId, viewer, clinicId);
      const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
      if (!clinic) throw new BadRequestException("Invalid clinicId");
    }

    let phone: string | undefined;
    if (dto.phone !== undefined) {
      phone = dto.phone.replace(/\D/g, "");
      if (phone.length < 8) throw new BadRequestException("Phone must contain at least 8 digits");
    }

    const primaryClinicId = resolvedClinicIds?.[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(primaryClinicId ? { clinicId: primaryClinicId } : clinicId ? { clinicId } : {}),
          ...(dto.firstNameEn !== undefined ? { firstNameEn: dto.firstNameEn } : {}),
          ...(dto.lastNameEn !== undefined ? { lastNameEn: dto.lastNameEn } : {}),
          ...(dto.firstNameAr !== undefined ? { firstNameAr: dto.firstNameAr.trim() || null } : {}),
          ...(dto.lastNameAr !== undefined ? { lastNameAr: dto.lastNameAr.trim() || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
          ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
          ...(dto.hireDate !== undefined ? { hireDate: new Date(dto.hireDate) } : {}),
          ...(dto.salaryBase !== undefined ? { salaryBase: dto.salaryBase } : {}),
        },
      });
      if (existing.userId && resolvedClinicIds !== undefined) {
        await syncUserClinicAdminScopes(tx, tenantId, existing.userId, resolvedClinicIds);
      }
    });

    const row = await this.prisma.employee.findFirst({
      where: { id },
      include: this.employeeInclude,
    });
    return this.mapEmployee(row!);
  }

  async deactivateEmployee(
    tenantId: string,
    id: string,
    dto: DeactivateEmployeeDto,
    viewer: JwtUser,
  ): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);
    const emp = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: { employmentPeriods: { orderBy: { startDate: "desc" } } },
    });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    if (emp.recordStatus === EmployeeRecordStatus.INACTIVE) {
      throw new BadRequestException("Employee is already inactive");
    }

    const resignationDate = new Date(dto.resignationDate);
    const hireDate = emp.hireDate;
    if (resignationDate < hireDate) {
      throw new BadRequestException("Resignation date cannot be before hire date");
    }

    await this.prisma.$transaction(async (tx) => {
      const openPeriod = await tx.employeeEmploymentPeriod.findFirst({
        where: { employeeId: id, endDate: null },
        orderBy: { startDate: "desc" },
      });
      if (openPeriod) {
        await tx.employeeEmploymentPeriod.update({
          where: { id: openPeriod.id },
          data: { endDate: resignationDate, separationReason: EmployeeSeparationReason.RESIGNATION },
        });
      } else {
        await tx.employeeEmploymentPeriod.create({
          data: {
            employeeId: id,
            startDate: hireDate,
            endDate: resignationDate,
            separationReason: EmployeeSeparationReason.RESIGNATION,
          },
        });
      }
      await tx.employee.update({
        where: { id },
        data: {
          recordStatus: EmployeeRecordStatus.INACTIVE,
          resignationDate,
          separationReason: EmployeeSeparationReason.RESIGNATION,
        },
      });
      if (emp.userId) {
        await deactivateUserForEmployee(tx, tenantId, emp.userId, resignationDate);
      }
    });

    const row = await this.prisma.employee.findFirst({
      where: { id },
      include: this.employeeInclude,
    });
    return this.mapEmployee(row!);
  }

  async reactivateEmployee(
    tenantId: string,
    id: string,
    dto: ReactivateEmployeeDto,
    viewer: JwtUser,
  ): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);
    const emp = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    if (emp.recordStatus !== EmployeeRecordStatus.INACTIVE) {
      throw new BadRequestException("Employee is already active");
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);
    if (emp.resignationDate && startDate <= emp.resignationDate) {
      throw new BadRequestException("Reactivation date must be after the resignation date");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeEmploymentPeriod.create({
        data: { employeeId: id, startDate },
      });
      await tx.employee.update({
        where: { id },
        data: {
          recordStatus: EmployeeRecordStatus.ACTIVE,
          resignationDate: null,
          separationReason: null,
        },
      });
      if (emp.userId) {
        await reactivateUserForEmployee(tx, tenantId, emp.userId, startDate);
      }
    });

    const row = await this.prisma.employee.findFirst({
      where: { id },
      include: this.employeeInclude,
    });
    return this.mapEmployee(row!);
  }

  async deleteEmployee(tenantId: string, id: string, viewer: JwtUser): Promise<{ ok: true; id: string; archived: true }> {
    this.assertCanDeleteEmployee(viewer);
    const emp = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);

    await this.prisma.$transaction(async (tx) => {
      await softDeleteLinkedEmployee(tx, tenantId, id, viewer.userId);
    });
    return { ok: true, id, archived: true };
  }

  async restoreEmployeeRecord(
    tenantId: string,
    id: string,
    dto: ReactivateEmployeeDto,
    viewer: JwtUser,
  ): Promise<EmployeeDto> {
    this.assertCanManageEmployees(viewer);
    const emp = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);
    await this.prisma.$transaction(async (tx) => {
      await restoreEmployee(tx, tenantId, id, startDate, viewer.userId);
    });
    const row = await this.prisma.employee.findFirst({
      where: { id },
      include: this.employeeInclude,
    });
    return this.mapEmployee(row!);
  }

  async getEmployeeIdDocumentMeta(
    tenantId: string,
    employeeId: string,
    viewer: JwtUser
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp?.idDocRelativePath || !emp.idDocOriginalName || !emp.idDocMimeType) {
      throw new NotFoundException("No ID document attached");
    }
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    await this.uploads.assertExists("employees", emp.idDocRelativePath);
    return { storageKey: emp.idDocRelativePath, mimeType: emp.idDocMimeType, originalFileName: emp.idDocOriginalName };
  }

  openEmployeeIdDocumentReadStream(storageKey: string) {
    return this.uploads.getReadStream("employees", storageKey);
  }

  async getEmployeeUserAvatarMeta(
    tenantId: string,
    employeeId: string,
    viewer: JwtUser,
  ): Promise<{ storageKey: string; mimeType: string }> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { user: { select: { avatarRelativePath: true, avatarMimeType: true } } },
    });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertClinicAdminCanUseClinic(tenantId, viewer, emp.clinicId);
    const avatarPath = emp.user?.avatarRelativePath;
    if (!avatarPath) throw new NotFoundException("No profile picture for this employee");
    await this.uploads.assertExists("users", avatarPath);
    return {
      storageKey: avatarPath,
      mimeType: emp.user?.avatarMimeType || "image/jpeg",
    };
  }

  openEmployeeUserAvatarReadStream(storageKey: string) {
    return this.uploads.getReadStream("users", storageKey);
  }

  async listAttendance(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    employeeIdStr?: string,
    workDateFrom?: string,
    workDateTo?: string,
    statusStr?: string,
    sortByStr?: string,
    sortOrderStr?: string
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const employeeId = employeeIdStr?.trim();
    const st = statusStr?.trim().toUpperCase();
    const wf = workDateFrom?.trim();
    const wt = workDateTo?.trim();

    const dateFilter: Prisma.DateTimeFilter | undefined =
      wf && wt
        ? {
            gte: new Date(`${wf}T00:00:00`),
            lte: new Date(`${wt}T23:59:59.999`),
          }
        : undefined;

    const where: Prisma.AttendanceWhereInput = {
      employee: { tenantId, ...(employeeId ? { id: employeeId } : {}) },
      ...(dateFilter ? { workDate: dateFilter } : {}),
      ...(st && (Object.values(AttendanceStatus) as string[]).includes(st) ? { status: st as AttendanceStatus } : {}),
    };

    const sortField = pickSortField(sortByStr, ["workDate", "clockIn", "clockOut", "status"] as const, "workDate");
    const sortDir = parseSortOrder(sortOrderStr);

    const [total, rows] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: {
          employee: {
            select: {
              employeeNumber: true,
              firstNameEn: true,
              lastNameEn: true,
              firstNameAr: true,
              lastNameAr: true,
              clinic: { select: { nameEn: true, nameAr: true } },
            },
          },
        },
      }),
    ]);
    return paginate(
      rows.map((r) => this.mapAttendance(r, r.employee)),
      total,
      page,
      pageSize
    );
  }

  async createAttendance(tenantId: string, dto: CreateAttendanceDto): Promise<AttendanceDto> {
    const existing = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
      include: { clinic: { select: { nameEn: true, nameAr: true } } },
    });
    if (!existing) throw new BadRequestException("Invalid employeeId");
    if (existing.recordStatus !== EmployeeRecordStatus.ACTIVE) {
      throw new BadRequestException("Cannot record attendance for an inactive employee");
    }
    const row = await this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        workDate: new Date(dto.workDate),
        clockIn: dto.clockIn ? new Date(dto.clockIn) : null,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : null,
        status: dto.status ?? AttendanceStatus.PRESENT,
        notes: dto.notes ?? null,
      },
    });
    return this.mapAttendance(row, {
      employeeNumber: existing.employeeNumber,
      firstNameEn: existing.firstNameEn,
      lastNameEn: existing.lastNameEn,
      firstNameAr: existing.firstNameAr,
      lastNameAr: existing.lastNameAr,
      clinic: existing.clinic,
    });
  }

  async listLeaveRequests(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    employeeIdStr?: string,
    statusStr?: string,
    startFrom?: string,
    startTo?: string,
    sortByStr?: string,
    sortOrderStr?: string
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const employeeId = employeeIdStr?.trim();
    const st = statusStr?.trim().toUpperCase();
    const sf = startFrom?.trim();
    const stt = startTo?.trim();

    const startRange: Prisma.DateTimeFilter | undefined =
      sf && stt
        ? {
            gte: new Date(`${sf}T00:00:00`),
            lte: new Date(`${stt}T23:59:59.999`),
          }
        : undefined;

    const where: Prisma.LeaveRequestWhereInput = {
      employee: { tenantId, ...(employeeId ? { id: employeeId } : {}) },
      ...(st && (Object.values(LeaveStatus) as string[]).includes(st) ? { status: st as LeaveStatus } : {}),
      ...(startRange ? { startDate: startRange } : {}),
    };

    const sortField = pickSortField(sortByStr, ["startDate", "endDate", "createdAt", "type", "status"] as const, "startDate");
    const sortDir = parseSortOrder(sortOrderStr);

    const [total, rows] = await Promise.all([
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
      }),
    ]);
    return paginate(rows.map((r) => this.mapLeave(r)), total, page, pageSize);
  }

  async createLeaveRequest(tenantId: string, dto: CreateLeaveRequestDto): Promise<LeaveRequestDto> {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } });
    if (!emp) throw new BadRequestException("Invalid employeeId");
    if (emp.recordStatus !== EmployeeRecordStatus.ACTIVE) {
      throw new BadRequestException("Cannot submit leave for an inactive employee");
    }
    const row = await this.prisma.leaveRequest.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason ?? null,
        status: LeaveStatus.PENDING,
      },
    });
    return this.mapLeave(row);
  }

  async updateLeaveStatus(tenantId: string, id: string, status: LeaveStatus): Promise<LeaveRequestDto> {
    const row = await this.prisma.leaveRequest.findFirst({
      where: { id, employee: { tenantId } },
    });
    if (!row) throw new NotFoundException("Leave request not found");
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status },
    });
    return this.mapLeave(updated);
  }

  async hrSummary(tenantId: string) {
    await ensureClinicStaffEmployeeRecords(this.prisma, tenantId);
    const [employeeCount, monthlyPayroll, pendingLeave] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, recordStatus: EmployeeRecordStatus.ACTIVE } }),
      this.prisma.employee.aggregate({
        where: { tenantId, recordStatus: EmployeeRecordStatus.ACTIVE },
        _sum: { salaryBase: true },
      }),
      this.prisma.leaveRequest.count({
        where: { employee: { tenantId }, status: LeaveStatus.PENDING },
      }),
    ]);
    return {
      employeeCount,
      monthlyPayrollEstimate: Number(monthlyPayroll._sum.salaryBase ?? 0),
      pendingLeaveRequests: pendingLeave,
    };
  }
}
