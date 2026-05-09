import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  AttendanceStatus,
  EmploymentType,
  EncounterStatus,
  ExpenseStatus,
  Gender,
  LeaveStatus,
  LeaveType,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { isPlatformSuperAdminEmail } from "../../common/platform-super-admin";
import { paginate, parsePageParams } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";

/** URL-safe table keys (allowlisted). */
export const DATA_EXPLORER_TABLES = [
  "feature_flags",
  "tenants",
  "users",
  "clinics",
  "patients",
  "employees",
  "appointments",
  "encounters",
  "expenses",
  "revenue_entries",
  "audit_logs",
  "clinic_admin_scopes",
  "user_nav_tab_grants",
  "diagnoses",
  "encounter_medications",
  "attendances",
  "leave_requests",
] as const;

export type DataExplorerTable = (typeof DATA_EXPLORER_TABLES)[number];

function assertPlatformSuperAdmin(user: JwtUser): void {
  if (!isPlatformSuperAdminEmail(user.email)) {
    throw new ForbiddenException("Only platform super administrators can use the data explorer");
  }
}

function isTableKey(s: string): s is DataExplorerTable {
  return (DATA_EXPLORER_TABLES as readonly string[]).includes(s);
}

/** Serialize Prisma values for JSON (dates, decimals, json). */
export function serializeRow(row: unknown): unknown {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (typeof row === "bigint") return row.toString();
  if (row instanceof Uint8Array) return Buffer.from(row).toString("base64");
  if (typeof row === "object" && row !== null && "toJSON" in row && typeof (row as { toJSON: () => unknown }).toJSON === "function") {
    return serializeRow((row as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(row)) return row.map((x) => serializeRow(x));
  if (typeof row === "object") {
    const o = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === "passwordHash") continue;
      out[k] = serializeRow(v);
    }
    return out;
  }
  return row;
}

@Injectable()
export class AdminDataExplorerService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return {
      tables: [
        { key: "feature_flags", label: "Feature flags", scope: "global", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "tenants", label: "Tenant (this org)", scope: "current", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "users", label: "Users", scope: "tenant", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "clinics", label: "Clinics", scope: "tenant", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "patients", label: "Patients", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: false } },
        { key: "employees", label: "Employees", scope: "tenant", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "appointments", label: "Appointments", scope: "tenant", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "encounters", label: "Encounters", scope: "tenant", ops: { list: true, get: true, create: false, patch: true, delete: false } },
        { key: "expenses", label: "Expenses", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "revenue_entries", label: "Revenue entries", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "audit_logs", label: "Audit logs", scope: "tenant", ops: { list: true, get: true, create: false, patch: false, delete: false } },
        { key: "clinic_admin_scopes", label: "Clinic admin scopes", scope: "tenant", ops: { list: true, get: true, create: true, patch: false, delete: true } },
        { key: "user_nav_tab_grants", label: "User nav tab grants", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "diagnoses", label: "Diagnoses", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "encounter_medications", label: "Encounter medications", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "attendances", label: "Attendance", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
        { key: "leave_requests", label: "Leave requests", scope: "tenant", ops: { list: true, get: true, create: true, patch: true, delete: true } },
      ],
    };
  }

  async list(user: JwtUser, table: string, pageStr?: string, pageSizeStr?: string) {
    assertPlatformSuperAdmin(user);
    if (!isTableKey(table)) throw new BadRequestException("Unknown table");
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const tenantId = user.tenantId;

    switch (table) {
      case "feature_flags": {
        const [total, rows] = await Promise.all([
          this.prisma.featureFlag.count(),
          this.prisma.featureFlag.findMany({ orderBy: { key: "asc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "tenants": {
        const [total, rows] = await Promise.all([
          this.prisma.tenant.count({ where: { id: tenantId } }),
          this.prisma.tenant.findMany({ where: { id: tenantId }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "users": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.user.count({ where }),
          this.prisma.user.findMany({
            where,
            orderBy: { email: "asc" },
            skip,
            take: pageSize,
            select: {
              id: true,
              tenantId: true,
              email: true,
              displayName: true,
              role: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "clinics": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.clinic.count({ where }),
          this.prisma.clinic.findMany({ where, orderBy: { nameEn: "asc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "patients": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.patient.count({ where }),
          this.prisma.patient.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "employees": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.employee.count({ where }),
          this.prisma.employee.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "appointments": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.appointment.count({ where }),
          this.prisma.appointment.findMany({ where, orderBy: { startsAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "encounters": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.encounter.count({ where }),
          this.prisma.encounter.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "expenses": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.expense.count({ where }),
          this.prisma.expense.findMany({ where, orderBy: { incurredAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "revenue_entries": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.revenueEntry.count({ where }),
          this.prisma.revenueEntry.findMany({ where, orderBy: { postedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "audit_logs": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.auditLog.count({ where }),
          this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "clinic_admin_scopes": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.clinicAdminScope.count({ where }),
          this.prisma.clinicAdminScope.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "user_nav_tab_grants": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.userNavTabGrant.count({ where }),
          this.prisma.userNavTabGrant.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "diagnoses": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.diagnosis.count({ where }),
          this.prisma.diagnosis.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "encounter_medications": {
        const where = { tenantId };
        const [total, rows] = await Promise.all([
          this.prisma.encounterMedication.count({ where }),
          this.prisma.encounterMedication.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "attendances": {
        const [total, rows] = await Promise.all([
          this.prisma.attendance.count({
            where: { employee: { tenantId } },
          }),
          this.prisma.attendance.findMany({
            where: { employee: { tenantId } },
            orderBy: { workDate: "desc" },
            skip,
            take: pageSize,
          }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      case "leave_requests": {
        const [total, rows] = await Promise.all([
          this.prisma.leaveRequest.count({
            where: { employee: { tenantId } },
          }),
          this.prisma.leaveRequest.findMany({
            where: { employee: { tenantId } },
            orderBy: { updatedAt: "desc" },
            skip,
            take: pageSize,
          }),
        ]);
        return paginate(rows.map((r) => serializeRow(r) as object), total, page, pageSize);
      }
      default:
        throw new BadRequestException("Unknown table");
    }
  }

  async getOne(user: JwtUser, table: string, id: string) {
    assertPlatformSuperAdmin(user);
    if (!isTableKey(table)) throw new BadRequestException("Unknown table");
    const tenantId = user.tenantId;
    const row = await this.findOneRaw(table, id, tenantId);
    if (!row) throw new NotFoundException("Row not found");
    return serializeRow(row);
  }

  private async findOneRaw(table: DataExplorerTable, id: string, tenantId: string): Promise<unknown | null> {
    switch (table) {
      case "feature_flags":
        return this.prisma.featureFlag.findUnique({ where: { id } });
      case "tenants": {
        const t = await this.prisma.tenant.findUnique({ where: { id } });
        return t?.id === tenantId ? t : null;
      }
      case "users":
        return this.prisma.user.findFirst({ where: { id, tenantId }, select: { id: true, tenantId: true, email: true, displayName: true, role: true, createdAt: true, updatedAt: true } });
      case "clinics":
        return this.prisma.clinic.findFirst({ where: { id, tenantId } });
      case "patients":
        return this.prisma.patient.findFirst({ where: { id, tenantId } });
      case "employees":
        return this.prisma.employee.findFirst({ where: { id, tenantId } });
      case "appointments":
        return this.prisma.appointment.findFirst({ where: { id, tenantId } });
      case "encounters":
        return this.prisma.encounter.findFirst({ where: { id, tenantId } });
      case "expenses":
        return this.prisma.expense.findFirst({ where: { id, tenantId } });
      case "revenue_entries":
        return this.prisma.revenueEntry.findFirst({ where: { id, tenantId } });
      case "audit_logs":
        return this.prisma.auditLog.findFirst({ where: { id, tenantId } });
      case "clinic_admin_scopes":
        return this.prisma.clinicAdminScope.findFirst({ where: { id, tenantId } });
      case "user_nav_tab_grants":
        return this.prisma.userNavTabGrant.findFirst({ where: { id, tenantId } });
      case "diagnoses":
        return this.prisma.diagnosis.findFirst({ where: { id, tenantId } });
      case "encounter_medications":
        return this.prisma.encounterMedication.findFirst({ where: { id, tenantId } });
      case "attendances":
        return this.prisma.attendance.findFirst({
          where: { id, employee: { tenantId } },
        });
      case "leave_requests":
        return this.prisma.leaveRequest.findFirst({
          where: { id, employee: { tenantId } },
        });
      default:
        return null;
    }
  }

  async create(user: JwtUser, table: string, body: Record<string, unknown>) {
    assertPlatformSuperAdmin(user);
    if (!isTableKey(table)) throw new BadRequestException("Unknown table");
    const tenantId = user.tenantId;

    switch (table) {
      case "patients": {
        const mrn = String(body.mrn ?? "").trim();
        const firstNameEn = String(body.firstNameEn ?? "").trim();
        const lastNameEn = String(body.lastNameEn ?? "").trim();
        const dob = body.dob ? new Date(String(body.dob)) : null;
        if (!mrn || !firstNameEn || !lastNameEn || !dob || Number.isNaN(dob.getTime())) {
          throw new BadRequestException("patients require mrn, firstNameEn, lastNameEn, dob (ISO)");
        }
        const gender = String(body.gender ?? "UNKNOWN") as Gender;
        if (!Object.values(Gender).includes(gender)) throw new BadRequestException("Invalid gender");
        const phone = String(body.phone ?? "").trim();
        if (!phone) throw new BadRequestException("phone is required");
        const row = await this.prisma.patient.create({
          data: {
            tenantId,
            mrn,
            firstNameEn,
            lastNameEn,
            firstNameAr: body.firstNameAr != null ? String(body.firstNameAr) : null,
            lastNameAr: body.lastNameAr != null ? String(body.lastNameAr) : null,
            dob,
            gender,
            phone,
            email: body.email != null ? String(body.email) : null,
            nationalId: body.nationalId != null ? String(body.nationalId) : null,
            homeBranchId: body.homeBranchId != null ? String(body.homeBranchId) : null,
          },
        });
        return serializeRow(row);
      }
      case "expenses": {
        const clinicId = String(body.clinicId ?? "");
        const c = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
        if (!c) throw new BadRequestException("Invalid clinicId");
        const category = String(body.category ?? "").trim();
        const amount = Number(body.amount);
        const currency = String(body.currency ?? "AED").trim();
        const incurredAt = body.incurredAt ? new Date(String(body.incurredAt)) : null;
        if (!category || !Number.isFinite(amount) || !incurredAt || Number.isNaN(incurredAt.getTime())) {
          throw new BadRequestException("expenses require clinicId, category, amount, incurredAt (ISO)");
        }
        const status = (String(body.status ?? "PENDING") as ExpenseStatus) || ExpenseStatus.PENDING;
        if (!Object.values(ExpenseStatus).includes(status)) throw new BadRequestException("Invalid status");
        const row = await this.prisma.expense.create({
          data: {
            tenantId,
            clinicId,
            category,
            vendorName: body.vendorName != null ? String(body.vendorName) : null,
            amount,
            currency,
            incurredAt,
            status,
            proofRelativePath: body.proofRelativePath != null ? String(body.proofRelativePath) : null,
            proofOriginalName: body.proofOriginalName != null ? String(body.proofOriginalName) : null,
            proofMimeType: body.proofMimeType != null ? String(body.proofMimeType) : null,
          },
        });
        return serializeRow(row);
      }
      case "revenue_entries": {
        const clinicId = String(body.clinicId ?? "");
        const c = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
        if (!c) throw new BadRequestException("Invalid clinicId");
        const category = String(body.category ?? "").trim();
        const grossAmount = Number(body.grossAmount);
        const taxAmount = Number(body.taxAmount ?? 0);
        const netAmount = Number(body.netAmount);
        const currency = String(body.currency ?? "AED").trim();
        const postedAt = body.postedAt ? new Date(String(body.postedAt)) : null;
        if (!category || !Number.isFinite(grossAmount) || !Number.isFinite(netAmount) || !postedAt || Number.isNaN(postedAt.getTime())) {
          throw new BadRequestException("revenue_entries require clinicId, category, grossAmount, netAmount, postedAt (ISO)");
        }
        const status = (String(body.status ?? "POSTED") as RevenueStatus) || RevenueStatus.POSTED;
        if (!Object.values(RevenueStatus).includes(status)) throw new BadRequestException("Invalid status");
        const row = await this.prisma.revenueEntry.create({
          data: {
            tenantId,
            clinicId,
            appointmentId: body.appointmentId != null ? String(body.appointmentId) : null,
            encounterId: body.encounterId != null ? String(body.encounterId) : null,
            category,
            description: body.description != null ? String(body.description) : null,
            grossAmount,
            taxAmount: Number.isFinite(taxAmount) ? taxAmount : 0,
            netAmount,
            currency,
            postedAt,
            status,
          },
        });
        return serializeRow(row);
      }
      case "clinic_admin_scopes": {
        const userId = String(body.userId ?? "");
        const clinicId = String(body.clinicId ?? "");
        const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
        const cl = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
        if (!u || !cl) throw new BadRequestException("Invalid userId or clinicId");
        const row = await this.prisma.clinicAdminScope.create({
          data: { tenantId, userId, clinicId },
        });
        return serializeRow(row);
      }
      case "user_nav_tab_grants": {
        const userId = String(body.userId ?? "");
        const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
        if (!u) throw new BadRequestException("Invalid userId");
        const tabKeys = body.tabKeys;
        if (!Array.isArray(tabKeys)) throw new BadRequestException("tabKeys must be an array of strings");
        const row = await this.prisma.userNavTabGrant.create({
          data: {
            tenantId,
            userId,
            tabKeys: tabKeys as Prisma.InputJsonValue,
            updatedByUserId: user.userId,
          },
        });
        return serializeRow(row);
      }
      case "diagnoses": {
        const encounterId = String(body.encounterId ?? "");
        const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
        if (!enc) throw new BadRequestException("Invalid encounterId");
        const icd10Code = String(body.icd10Code ?? "").trim();
        const descriptionEn = String(body.descriptionEn ?? "").trim();
        if (!icd10Code || !descriptionEn) throw new BadRequestException("diagnoses require icd10Code, descriptionEn");
        const row = await this.prisma.diagnosis.create({
          data: {
            tenantId,
            encounterId,
            icd10Code,
            descriptionEn,
            descriptionAr: body.descriptionAr != null ? String(body.descriptionAr) : null,
            isPrimary: Boolean(body.isPrimary),
          },
        });
        return serializeRow(row);
      }
      case "encounter_medications": {
        const encounterId = String(body.encounterId ?? "");
        const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
        if (!enc) throw new BadRequestException("Invalid encounterId");
        const drugName = String(body.drugName ?? "").trim();
        if (!drugName) throw new BadRequestException("drugName is required");
        const row = await this.prisma.encounterMedication.create({
          data: {
            tenantId,
            encounterId,
            drugName,
            dosage: body.dosage != null ? String(body.dosage) : null,
            route: body.route != null ? String(body.route) : null,
            frequency: body.frequency != null ? String(body.frequency) : null,
            duration: body.duration != null ? String(body.duration) : null,
            instructions: body.instructions != null ? String(body.instructions) : null,
          },
        });
        return serializeRow(row);
      }
      case "attendances": {
        const employeeId = String(body.employeeId ?? "");
        const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
        if (!emp) throw new BadRequestException("Invalid employeeId");
        const workDate = body.workDate ? new Date(String(body.workDate)) : null;
        if (!workDate || Number.isNaN(workDate.getTime())) throw new BadRequestException("workDate required (ISO date)");
        const status = (String(body.status ?? "PRESENT") as AttendanceStatus) || AttendanceStatus.PRESENT;
        if (!Object.values(AttendanceStatus).includes(status)) throw new BadRequestException("Invalid status");
        const row = await this.prisma.attendance.create({
          data: {
            employeeId,
            workDate,
            clockIn: body.clockIn ? new Date(String(body.clockIn)) : null,
            clockOut: body.clockOut ? new Date(String(body.clockOut)) : null,
            status,
            notes: body.notes != null ? String(body.notes) : null,
          },
        });
        return serializeRow(row);
      }
      case "leave_requests": {
        const employeeId = String(body.employeeId ?? "");
        const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
        if (!emp) throw new BadRequestException("Invalid employeeId");
        const type = String(body.type ?? "OTHER") as LeaveType;
        if (!Object.values(LeaveType).includes(type)) throw new BadRequestException("Invalid type");
        const startDate = body.startDate ? new Date(String(body.startDate)) : null;
        const endDate = body.endDate ? new Date(String(body.endDate)) : null;
        if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          throw new BadRequestException("startDate and endDate required");
        }
        const status = (String(body.status ?? "PENDING") as LeaveStatus) || LeaveStatus.PENDING;
        if (!Object.values(LeaveStatus).includes(status)) throw new BadRequestException("Invalid status");
        const row = await this.prisma.leaveRequest.create({
          data: {
            employeeId,
            type,
            startDate,
            endDate,
            status,
            reason: body.reason != null ? String(body.reason) : null,
          },
        });
        return serializeRow(row);
      }
      default:
        throw new BadRequestException("Create not supported for this table");
    }
  }

  async patch(user: JwtUser, table: string, id: string, body: Record<string, unknown>) {
    assertPlatformSuperAdmin(user);
    if (!isTableKey(table)) throw new BadRequestException("Unknown table");
    const tenantId = user.tenantId;
    await this.getOne(user, table, id);

    switch (table) {
      case "feature_flags": {
        const data: Prisma.FeatureFlagUpdateInput = {};
        if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
        if (body.description !== undefined) data.description = body.description === null ? null : String(body.description);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.featureFlag.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "tenants": {
        if (id !== tenantId) throw new BadRequestException("You can only edit the current organization tenant");
        const data: Prisma.TenantUpdateInput = {};
        if (body.name !== undefined) data.name = String(body.name);
        if (body.baseCurrency !== undefined) data.baseCurrency = String(body.baseCurrency);
        if (body.defaultLocale !== undefined) data.defaultLocale = String(body.defaultLocale);
        if (body.defaultVisitFee !== undefined) data.defaultVisitFee = Number(body.defaultVisitFee);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.tenant.update({ where: { id: tenantId }, data });
        return serializeRow(row);
      }
      case "users": {
        const data: Prisma.UserUpdateInput = {};
        if (body.email !== undefined) {
          const email = String(body.email).toLowerCase().trim();
          const clash = await this.prisma.user.findFirst({ where: { tenantId, email, NOT: { id } } });
          if (clash) throw new BadRequestException("Email already in use");
          data.email = email;
        }
        if (body.displayName !== undefined) data.displayName = String(body.displayName).trim();
        if (body.role !== undefined) {
          const role = String(body.role) as UserRole;
          if (!Object.values(UserRole).includes(role)) throw new BadRequestException("Invalid role");
          data.role = role;
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.user.update({ where: { id }, data });
        return serializeRow({
          id: row.id,
          tenantId: row.tenantId,
          email: row.email,
          displayName: row.displayName,
          role: row.role,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
      case "clinics": {
        const data: Prisma.ClinicUpdateInput = {};
        const str = (k: keyof typeof body) => (body[k] !== undefined ? String(body[k]) : undefined);
        if (body.nameEn !== undefined) data.nameEn = str("nameEn")!;
        if (body.nameAr !== undefined) data.nameAr = str("nameAr")!;
        if (body.city !== undefined) data.city = str("city")!;
        if (body.country !== undefined) data.country = str("country")!;
        if (body.addressEn !== undefined) data.addressEn = str("addressEn")!;
        if (body.addressAr !== undefined) data.addressAr = str("addressAr")!;
        if (body.locationUrl !== undefined) data.locationUrl = str("locationUrl")!;
        if (body.phone !== undefined) data.phone = str("phone")!;
        if (body.email !== undefined) data.email = str("email")!;
        if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl === null ? null : str("logoUrl")!;
        if (body.licenseNumber !== undefined) data.licenseNumber = str("licenseNumber")!;
        if (body.parentClinicId !== undefined) {
          const pid = body.parentClinicId === null ? null : String(body.parentClinicId);
          if (pid) {
            const p = await this.prisma.clinic.findFirst({ where: { id: pid, tenantId } });
            if (!p) throw new BadRequestException("Invalid parentClinicId");
            data.parent = { connect: { id: pid } };
          } else {
            data.parent = { disconnect: true };
          }
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.clinic.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "patients": {
        const data: Prisma.PatientUpdateInput = {};
        if (body.mrn !== undefined) data.mrn = String(body.mrn).trim();
        if (body.firstNameEn !== undefined) data.firstNameEn = String(body.firstNameEn).trim();
        if (body.lastNameEn !== undefined) data.lastNameEn = String(body.lastNameEn).trim();
        if (body.firstNameAr !== undefined) data.firstNameAr = body.firstNameAr === null ? null : String(body.firstNameAr);
        if (body.lastNameAr !== undefined) data.lastNameAr = body.lastNameAr === null ? null : String(body.lastNameAr);
        if (body.dob !== undefined) data.dob = new Date(String(body.dob));
        if (body.gender !== undefined) {
          const g = String(body.gender) as Gender;
          if (!Object.values(Gender).includes(g)) throw new BadRequestException("Invalid gender");
          data.gender = g;
        }
        if (body.phone !== undefined) data.phone = String(body.phone).trim();
        if (body.email !== undefined) data.email = body.email === null ? null : String(body.email);
        if (body.nationalId !== undefined) data.nationalId = body.nationalId === null ? null : String(body.nationalId);
        if (body.homeBranchId !== undefined) {
          const hid = body.homeBranchId === null ? null : String(body.homeBranchId);
          if (hid) {
            const cl = await this.prisma.clinic.findFirst({ where: { id: hid, tenantId } });
            if (!cl) throw new BadRequestException("Invalid homeBranchId");
            data.homeBranch = { connect: { id: hid } };
          } else {
            data.homeBranch = { disconnect: true };
          }
        }
        if (body.deletedAt !== undefined) {
          data.deletedAt = body.deletedAt === null ? null : new Date(String(body.deletedAt));
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.patient.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "employees": {
        const data: Prisma.EmployeeUpdateInput = {};
        if (body.firstNameEn !== undefined) data.firstNameEn = String(body.firstNameEn).trim();
        if (body.lastNameEn !== undefined) data.lastNameEn = String(body.lastNameEn).trim();
        if (body.email !== undefined) data.email = body.email === null ? null : String(body.email);
        if (body.phone !== undefined) data.phone = String(body.phone).trim();
        if (body.jobTitle !== undefined) data.jobTitle = String(body.jobTitle).trim();
        if (body.employmentType !== undefined) {
          const et = String(body.employmentType) as EmploymentType;
          if (!Object.values(EmploymentType).includes(et)) throw new BadRequestException("Invalid employmentType");
          data.employmentType = et;
        }
        if (body.hireDate !== undefined) data.hireDate = new Date(String(body.hireDate));
        if (body.salaryBase !== undefined) data.salaryBase = Number(body.salaryBase);
        if (body.clinicId !== undefined) {
          const cid = String(body.clinicId);
          const cl = await this.prisma.clinic.findFirst({ where: { id: cid, tenantId } });
          if (!cl) throw new BadRequestException("Invalid clinicId");
          data.clinic = { connect: { id: cid } };
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.employee.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "appointments": {
        const data: Prisma.AppointmentUpdateInput = {};
        if (body.startsAt !== undefined) data.startsAt = new Date(String(body.startsAt));
        if (body.endsAt !== undefined) data.endsAt = new Date(String(body.endsAt));
        if (body.status !== undefined) {
          const st = String(body.status) as AppointmentStatus;
          if (!Object.values(AppointmentStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.appointment.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "encounters": {
        const data: Prisma.EncounterUpdateInput = {};
        if (body.status !== undefined) {
          const st = String(body.status) as EncounterStatus;
          if (!Object.values(EncounterStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (body.visitType !== undefined) data.visitType = String(body.visitType);
        if (body.chiefComplaint !== undefined) data.chiefComplaint = body.chiefComplaint === null ? null : String(body.chiefComplaint);
        if (body.subjective !== undefined) data.subjective = body.subjective === null ? null : String(body.subjective);
        if (body.objective !== undefined) data.objective = body.objective === null ? null : String(body.objective);
        if (body.assessment !== undefined) data.assessment = body.assessment === null ? null : String(body.assessment);
        if (body.plan !== undefined) data.plan = body.plan === null ? null : String(body.plan);
        if (body.visitFeeAmount !== undefined) data.visitFeeAmount = Number(body.visitFeeAmount);
        if (body.finalizedAt !== undefined) data.finalizedAt = body.finalizedAt === null ? null : new Date(String(body.finalizedAt));
        if (body.vitalsJson !== undefined) data.vitalsJson = body.vitalsJson === null ? Prisma.JsonNull : (body.vitalsJson as Prisma.InputJsonValue);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.encounter.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "expenses": {
        const data: Prisma.ExpenseUpdateInput = {};
        if (body.category !== undefined) data.category = String(body.category);
        if (body.vendorName !== undefined) data.vendorName = body.vendorName === null ? null : String(body.vendorName);
        if (body.amount !== undefined) data.amount = Number(body.amount);
        if (body.currency !== undefined) data.currency = String(body.currency);
        if (body.incurredAt !== undefined) data.incurredAt = new Date(String(body.incurredAt));
        if (body.status !== undefined) {
          const st = String(body.status) as ExpenseStatus;
          if (!Object.values(ExpenseStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.expense.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "revenue_entries": {
        const data: Prisma.RevenueEntryUpdateInput = {};
        if (body.category !== undefined) data.category = String(body.category);
        if (body.description !== undefined) data.description = body.description === null ? null : String(body.description);
        if (body.grossAmount !== undefined) data.grossAmount = Number(body.grossAmount);
        if (body.taxAmount !== undefined) data.taxAmount = Number(body.taxAmount);
        if (body.netAmount !== undefined) data.netAmount = Number(body.netAmount);
        if (body.currency !== undefined) data.currency = String(body.currency);
        if (body.postedAt !== undefined) data.postedAt = new Date(String(body.postedAt));
        if (body.status !== undefined) {
          const st = String(body.status) as RevenueStatus;
          if (!Object.values(RevenueStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.revenueEntry.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "user_nav_tab_grants": {
        if (body.tabKeys === undefined) throw new BadRequestException("tabKeys required");
        const tabKeys = body.tabKeys;
        if (!Array.isArray(tabKeys)) throw new BadRequestException("tabKeys must be an array");
        const row = await this.prisma.userNavTabGrant.update({
          where: { id },
          data: { tabKeys: tabKeys as Prisma.InputJsonValue, updatedByUserId: user.userId },
        });
        return serializeRow(row);
      }
      case "diagnoses": {
        const data: Prisma.DiagnosisUpdateInput = {};
        if (body.icd10Code !== undefined) data.icd10Code = String(body.icd10Code);
        if (body.descriptionEn !== undefined) data.descriptionEn = String(body.descriptionEn);
        if (body.descriptionAr !== undefined) data.descriptionAr = body.descriptionAr === null ? null : String(body.descriptionAr);
        if (body.isPrimary !== undefined) data.isPrimary = Boolean(body.isPrimary);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.diagnosis.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "encounter_medications": {
        const data: Prisma.EncounterMedicationUpdateInput = {};
        if (body.drugName !== undefined) data.drugName = String(body.drugName);
        if (body.dosage !== undefined) data.dosage = body.dosage === null ? null : String(body.dosage);
        if (body.route !== undefined) data.route = body.route === null ? null : String(body.route);
        if (body.frequency !== undefined) data.frequency = body.frequency === null ? null : String(body.frequency);
        if (body.duration !== undefined) data.duration = body.duration === null ? null : String(body.duration);
        if (body.instructions !== undefined) data.instructions = body.instructions === null ? null : String(body.instructions);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.encounterMedication.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "attendances": {
        const data: Prisma.AttendanceUpdateInput = {};
        if (body.workDate !== undefined) data.workDate = new Date(String(body.workDate));
        if (body.clockIn !== undefined) data.clockIn = body.clockIn === null ? null : new Date(String(body.clockIn));
        if (body.clockOut !== undefined) data.clockOut = body.clockOut === null ? null : new Date(String(body.clockOut));
        if (body.status !== undefined) {
          const st = String(body.status) as AttendanceStatus;
          if (!Object.values(AttendanceStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.attendance.update({ where: { id }, data });
        return serializeRow(row);
      }
      case "leave_requests": {
        const data: Prisma.LeaveRequestUpdateInput = {};
        if (body.type !== undefined) {
          const ty = String(body.type) as LeaveType;
          if (!Object.values(LeaveType).includes(ty)) throw new BadRequestException("Invalid type");
          data.type = ty;
        }
        if (body.startDate !== undefined) data.startDate = new Date(String(body.startDate));
        if (body.endDate !== undefined) data.endDate = new Date(String(body.endDate));
        if (body.status !== undefined) {
          const st = String(body.status) as LeaveStatus;
          if (!Object.values(LeaveStatus).includes(st)) throw new BadRequestException("Invalid status");
          data.status = st;
        }
        if (body.reason !== undefined) data.reason = body.reason === null ? null : String(body.reason);
        if (Object.keys(data).length === 0) throw new BadRequestException("No patchable fields");
        const row = await this.prisma.leaveRequest.update({ where: { id }, data });
        return serializeRow(row);
      }
      default:
        throw new BadRequestException("Patch not supported for this table");
    }
  }

  async remove(user: JwtUser, table: string, id: string) {
    assertPlatformSuperAdmin(user);
    if (!isTableKey(table)) throw new BadRequestException("Unknown table");
    const tenantId = user.tenantId;
    await this.getOne(user, table, id);

    switch (table) {
      case "expenses":
        await this.prisma.expense.delete({ where: { id } });
        return { ok: true };
      case "revenue_entries":
        await this.prisma.revenueEntry.delete({ where: { id } });
        return { ok: true };
      case "clinic_admin_scopes":
        await this.prisma.clinicAdminScope.delete({ where: { id } });
        return { ok: true };
      case "user_nav_tab_grants":
        await this.prisma.userNavTabGrant.delete({ where: { id } });
        return { ok: true };
      case "diagnoses":
        await this.prisma.diagnosis.delete({ where: { id } });
        return { ok: true };
      case "encounter_medications":
        await this.prisma.encounterMedication.delete({ where: { id } });
        return { ok: true };
      case "attendances":
        await this.prisma.attendance.delete({ where: { id } });
        return { ok: true };
      case "leave_requests":
        await this.prisma.leaveRequest.delete({ where: { id } });
        return { ok: true };
      default:
        throw new BadRequestException("Delete not supported for this table");
    }
  }
}
