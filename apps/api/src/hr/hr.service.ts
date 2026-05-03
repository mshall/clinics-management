import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus, LeaveStatus, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAttendanceDto } from "./dto/create-attendance.dto";
import type { CreateEmployeeDto } from "./dto/create-employee.dto";
import type { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import type { AttendanceDto } from "./dto/attendance.dto";
import type { EmployeeDto } from "./dto/employee.dto";
import type { LeaveRequestDto } from "./dto/leave-request.dto";

const MAX_ID_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_ID_DOC_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

type IdDocFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private employeeUploadRoot(): string {
    return path.join(process.cwd(), "uploads", "employees");
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

  private mapEmployee(e: {
    id: string;
    clinicId: string;
    employeeNumber: string;
    firstNameEn: string;
    lastNameEn: string;
    email: string | null;
    phone: string;
    jobTitle: string;
    employmentType: EmployeeDto["employmentType"];
    hireDate: Date;
    salaryBase: { toString(): string };
    userId: string | null;
    idDocRelativePath?: string | null;
    clinic?: { nameEn: string } | null;
  }): EmployeeDto {
    return {
      id: e.id,
      clinicId: e.clinicId,
      clinicNameEn: e.clinic?.nameEn ?? null,
      employeeNumber: e.employeeNumber,
      firstNameEn: e.firstNameEn,
      lastNameEn: e.lastNameEn,
      email: e.email,
      phone: e.phone,
      jobTitle: e.jobTitle,
      employmentType: e.employmentType,
      hireDate: e.hireDate.toISOString().slice(0, 10),
      salaryBase: Number(e.salaryBase),
      userId: e.userId,
      hasIdDoc: Boolean(e.idDocRelativePath),
    };
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
    emp?: { employeeNumber: string; firstNameEn: string; lastNameEn: string; clinic?: { nameEn: string } | null } | null
  ): AttendanceDto {
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeNumber: emp?.employeeNumber ?? null,
      employeeFullName: emp ? `${emp.firstNameEn} ${emp.lastNameEn}` : null,
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
    pageStr?: string,
    pageSizeStr?: string,
    search?: string,
    clinicIdStr?: string,
    nameFilterStr?: string,
    clinicFilterStr?: string,
    sortByStr?: string,
    sortOrderStr?: string
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const legacySearch = search?.trim();
    const nameFilter = (nameFilterStr ?? legacySearch)?.trim();
    const clinicFilter = clinicFilterStr?.trim();
    const clinicId = clinicIdStr?.trim();

    const and: Prisma.EmployeeWhereInput[] = [{ tenantId }];
    if (clinicId) and.push({ clinicId });
    if (nameFilter) {
      and.push({
        OR: [
          { employeeNumber: { contains: nameFilter, mode: "insensitive" } },
          { firstNameEn: { contains: nameFilter, mode: "insensitive" } },
          { lastNameEn: { contains: nameFilter, mode: "insensitive" } },
          { email: { contains: nameFilter, mode: "insensitive" } },
        ],
      });
    }
    if (clinicFilter) {
      and.push({ clinic: { nameEn: { contains: clinicFilter, mode: "insensitive" } } });
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
        include: { clinic: { select: { nameEn: true } } },
      }),
    ]);
    return paginate(rows.map((r) => this.mapEmployee(r)), total, page, pageSize);
  }

  async getEmployee(tenantId: string, id: string): Promise<EmployeeDto> {
    const row = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: { clinic: { select: { nameEn: true } } },
    });
    if (!row) throw new NotFoundException("Employee not found");
    return this.mapEmployee(row);
  }

  async createEmployee(tenantId: string, dto: CreateEmployeeDto): Promise<EmployeeDto> {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } });
    if (!clinic) throw new BadRequestException("Invalid clinicId");
    const phone = dto.phone.replace(/\D/g, "");
    if (phone.length < 8) throw new BadRequestException("Phone must contain at least 8 digits");
    const employeeNumber = await this.nextEmployeeNumber(tenantId);
    try {
      const row = await this.prisma.employee.create({
        data: {
          tenantId,
          clinicId: dto.clinicId,
          employeeNumber,
          firstNameEn: dto.firstNameEn,
          lastNameEn: dto.lastNameEn,
          email: dto.email ?? null,
          phone,
          jobTitle: dto.jobTitle,
          employmentType: dto.employmentType,
          hireDate: new Date(dto.hireDate),
          salaryBase: dto.salaryBase,
        },
      });
      const withClinic = await this.prisma.employee.findFirst({
        where: { id: row.id },
        include: { clinic: { select: { nameEn: true } } },
      });
      return this.mapEmployee(withClinic!);
    } catch {
      throw new BadRequestException("Duplicate employee number or invalid data");
    }
  }

  async attachEmployeeIdDocument(tenantId: string, employeeId: string, file?: IdDocFile): Promise<EmployeeDto> {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp) throw new NotFoundException("Employee not found");
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_ID_DOC_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_ID_DOC_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);
    const docId = randomUUID();
    const base = path.basename(file.originalname || "id").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "id";
    const relativePath = `${tenantId}/${employeeId}/${docId}-${base}`;
    const abs = path.join(this.employeeUploadRoot(), tenantId, employeeId, `${docId}-${base}`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);
    const row = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        idDocRelativePath: relativePath,
        idDocOriginalName: file.originalname || base,
        idDocMimeType: mime,
      },
      include: { clinic: { select: { nameEn: true } } },
    });
    return this.mapEmployee(row);
  }

  async getEmployeeIdDocumentMeta(
    tenantId: string,
    employeeId: string
  ): Promise<{ absolutePath: string; mimeType: string; originalFileName: string }> {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp?.idDocRelativePath || !emp.idDocOriginalName || !emp.idDocMimeType) {
      throw new NotFoundException("No ID document attached");
    }
    const absolutePath = path.join(this.employeeUploadRoot(), emp.idDocRelativePath);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException("ID document file missing on disk");
    }
    return { absolutePath, mimeType: emp.idDocMimeType, originalFileName: emp.idDocOriginalName };
  }

  getEmployeeIdDocumentReadStream(absolutePath: string) {
    return createReadStream(absolutePath);
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
              clinic: { select: { nameEn: true } },
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
      include: { clinic: { select: { nameEn: true } } },
    });
    if (!existing) throw new BadRequestException("Invalid employeeId");
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
    const [employeeCount, monthlyPayroll, pendingLeave] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.aggregate({
        where: { tenantId },
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
