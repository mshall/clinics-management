import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OperationDocumentKind, OperationStatus, Prisma, RevenueStatus, UserRole } from "@prisma/client";
import {
  assertOperationStatusTransition,
  isTerminalOperationStatus,
  normalizeOperationStatus,
  operationAllowsPostSurgeryDocuments,
  operationStatusIsEditable,
} from "./operation-status-flow";
import { randomUUID } from "crypto";
import * as path from "path";
import type { JwtUser } from "../auth/jwt-user";
import { findActiveSchedulingPhysician } from "../common/active-scheduling-physician";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { hasRole } from "../common/effective-roles";
import {
  assertOperationAcquisition,
  hasPatientAcquisitionInput,
  patientAcquisitionUpdateData,
} from "../common/patient-acquisition";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { isBaseCurrency } from "../common/base-currencies";
import { canAdminEditCompletedOperation } from "../common/operation-admin-roles";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { resolveReportingRange } from "../common/reporting-range";
import { PrismaService } from "../prisma/prisma.service";
import { postRevenue } from "../compliance/post-revenue";
import { syncPostedOperationContractRevenue } from "../compliance/operation-revenue-ledger";
import { voidPostedRevenuesWithFiscalReturns } from "../compliance/void-revenue-adjustments";
import {
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  loadUserMoneyVisibilityOverrides,
  type UserMoneyVisibilityOverrides,
  canEditOperationFeesForViewer,
  operationRowFinancialsVisible,
  operationSummaryFinancialsVisibleForViewer,
} from "../common/user-money-visibility";
import { assertCanCompleteOperation } from "./operation-complete-roles";
import {
  assertOperationContractCost,
  isZeroCostAllowedForComplete,
} from "./operation-contract-cost";
import { assertMayApplyOperationUpdate } from "./operation-stage-roles";
import { assertDownPaymentBeforeInProgress } from "./operation-status-money";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { DocumentProcessingService } from "../storage/processing/document-processing.service";
import { adjustTenantStorageBytes } from "../storage/processing/storage-usage";
import { MAX_UPLOAD_BYTES as SHARED_MAX_UPLOAD_BYTES } from "../common/upload-errors";
import type { AddOperationMedicationDto, OperationDocumentDto, OperationMedicationDto } from "./dto/operation-clinical.dto";
import type { CreateOperationDto } from "./dto/create-operation.dto";
import type { OperationDto } from "./dto/operation.dto";
import type { OperationDetailDto } from "./dto/operation-detail.dto";
import type { UpdateOperationDto } from "./dto/update-operation.dto";

const MAX_UPLOAD_BYTES = SHARED_MAX_UPLOAD_BYTES;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
]);

const operationInclude = {
  patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, homeBranchId: true } },
  clinic: { select: { nameEn: true, nameAr: true } },
  clinician: {
    select: {
      displayName: true,
      employee: { select: { firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
    },
  },
} as const;

type OperationRow = Prisma.OperationGetPayload<{ include: typeof operationInclude }>;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly documentProcessing: DocumentProcessingService,
  ) {}

  private ensureEditableStatus(status: OperationStatus): void {
    if (!operationStatusIsEditable(status)) {
      throw new BadRequestException("Only booked or pre-op operations can be edited");
    }
  }

  private assertCanUploadDocument(kind: OperationDocumentKind, status: OperationStatus): void {
    if (kind === OperationDocumentKind.POST_SURGERY) {
      if (!operationAllowsPostSurgeryDocuments(status)) {
        throw new BadRequestException("Post-surgery documents can only be added to discharged operations");
      }
      return;
    }
    // Consent + operation report: allowed while booking/prep is editable, and after discharge (post-surgery).
    if (kind === OperationDocumentKind.CONSENT || kind === OperationDocumentKind.OPERATION_NOTE) {
      if (operationAllowsPostSurgeryDocuments(status)) return;
      this.ensureEditableStatus(status);
      return;
    }
    if (kind === OperationDocumentKind.ATTACHMENT || kind === OperationDocumentKind.PRESCRIPTION) {
      this.ensureEditableStatus(status);
      return;
    }
    throw new BadRequestException("This document kind cannot be uploaded through this endpoint");
  }

  private mapDoc(row: {
    id: string;
    kind: OperationDocumentKind;
    description: string | null;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }): OperationDocumentDto {
    return {
      id: row.id,
      kind: row.kind,
      description: row.description,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapMed(row: {
    id: string;
    drugName: string;
    dosage: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  }): OperationMedicationDto {
    return {
      id: row.id,
      drugName: row.drugName,
      dosage: row.dosage,
      route: row.route,
      frequency: row.frequency,
      duration: row.duration,
      instructions: row.instructions,
    };
  }

  private async deletePrescriptionDocuments(tenantId: string, operationId: string): Promise<void> {
    const docs = await this.prisma.operationDocument.findMany({
      where: { tenantId, operationId, kind: OperationDocumentKind.PRESCRIPTION },
    });
    for (const doc of docs) {
      await this.prisma.operationDocument.delete({ where: { id: doc.id } });
      await this.uploads.deleteObject("operations", doc.relativePath).catch(() => undefined);
    }
  }

  private async clearMedicationData(tenantId: string, operationId: string): Promise<void> {
    const docs = await this.prisma.operationDocument.findMany({
      where: { tenantId, operationId, kind: OperationDocumentKind.PRESCRIPTION },
    });
    for (const doc of docs) {
      await this.prisma.operationDocument.delete({ where: { id: doc.id } });
      await this.uploads.deleteObject("operations", doc.relativePath).catch(() => undefined);
    }
    await this.prisma.operationMedication.deleteMany({ where: { tenantId, operationId } });
  }

  private clinicianNameParts(
    clinician: null | {
      displayName: string;
      employee: { firstNameEn: string; lastNameEn: string; firstNameAr: string | null; lastNameAr: string | null } | null;
    }
  ): {
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstNameAr: string | null;
    lastNameAr: string | null;
    display: string | null;
  } {
    if (!clinician) {
      return { firstNameEn: null, lastNameEn: null, firstNameAr: null, lastNameAr: null, display: null };
    }
    const e = clinician.employee;
    if (e) {
      const en = `${e.firstNameEn ?? ""} ${e.lastNameEn ?? ""}`.trim();
      return {
        firstNameEn: e.firstNameEn,
        lastNameEn: e.lastNameEn,
        firstNameAr: e.firstNameAr,
        lastNameAr: e.lastNameAr,
        display: en || clinician.displayName?.trim() || null,
      };
    }
    const d = clinician.displayName?.trim();
    const parts = d ? d.split(/\s+/) : [];
    return {
      firstNameEn: parts[0] ?? d ?? null,
      lastNameEn: parts.length > 1 ? parts.slice(1).join(" ") : null,
      firstNameAr: null,
      lastNameAr: null,
      display: d || null,
    };
  }

  private clinicianDisplayName(
    clinician: null | {
      displayName: string;
      employee: { firstNameEn: string; lastNameEn: string; firstNameAr: string | null; lastNameAr: string | null } | null;
    }
  ): string | null {
    return this.clinicianNameParts(clinician).display;
  }

  private async resolveOperationFeeCurrency(
    tenantId: string,
    clinicId: string,
    feeCurrency?: string,
  ): Promise<string> {
    if (feeCurrency?.trim()) {
      const code = feeCurrency.trim();
      if (!isBaseCurrency(code)) throw new BadRequestException("Invalid fee currency");
      return code;
    }
    return resolveClinicCurrency(this.prisma, tenantId, clinicId);
  }

  private async moneyOverrides(tenantId: string, viewer?: JwtUser): Promise<UserMoneyVisibilityOverrides> {
    return loadUserMoneyVisibilityOverrides(this.prisma, tenantId, viewer?.userId);
  }

  private mapRow(
    row: OperationRow,
    viewer?: JwtUser,
    overrides: UserMoneyVisibilityOverrides = DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  ): OperationDto {
    const patient = row.patient;
    const clinicianParts = this.clinicianNameParts(row.clinician ?? null);
    const financialsVisible = operationRowFinancialsVisible(viewer, row.clinicianId, overrides);
    const totalCost = Number(row.totalCost);
    const downPayment = Number(row.downPayment);
    const paidAmount = Number(row.paidAmount);
    const balanceDue = Math.max(0, totalCost - paidAmount);
    return {
      id: row.id,
      clinicId: row.clinicId,
      clinicNameEn: row.clinic?.nameEn ?? null,
      clinicNameAr: row.clinic?.nameAr ?? null,
      patientId: row.patientId,
      patientMrn: patient?.mrn ?? null,
      patientName: patient ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim() : null,
      clinicianId: row.clinicianId,
      clinicianName: clinicianParts.display,
      clinicianFirstNameEn: clinicianParts.firstNameEn,
      clinicianLastNameEn: clinicianParts.lastNameEn,
      clinicianFirstNameAr: clinicianParts.firstNameAr,
      clinicianLastNameAr: clinicianParts.lastNameAr,
      operationDate: row.operationDate.toISOString(),
      totalCost: financialsVisible ? totalCost : 0,
      downPayment: financialsVisible ? downPayment : 0,
      paidAmount: financialsVisible ? paidAmount : 0,
      balanceDue: financialsVisible ? balanceDue : 0,
      feeCurrency: row.feeCurrency,
      isContract: row.isContract,
      acquisitionChannel: row.acquisitionChannel ?? null,
      comments: row.comments,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      financialsVisible,
    };
  }

  private async assertOperationAccess(viewer: JwtUser, row: { clinicianId: string; clinicId: string }): Promise<void> {
    if (hasRole(viewer, UserRole.PHYSICIAN) && row.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only manage operations assigned to you");
    }
    if (viewer.tenantId == null) throw new ForbiddenException();
    const scopeIds = await fetchClinicScopeIds(this.prisma, viewer.tenantId, viewer);
    if (scopeIds !== null && !scopeIds.includes(row.clinicId)) {
      throw new ForbiddenException("This operation is outside your assigned clinics");
    }
  }

  private mapDetailRow(
    row: OperationRow & {
      noMedications: boolean;
      medications: Array<{
        id: string;
        drugName: string;
        dosage: string | null;
        route: string | null;
        frequency: string | null;
        duration: string | null;
        instructions: string | null;
      }>;
      documents: Array<{
        id: string;
        kind: OperationDocumentKind;
        description: string | null;
        originalFileName: string;
        mimeType: string;
        sizeBytes: number;
        createdAt: Date;
      }>;
    },
    viewer: JwtUser,
    overrides: UserMoneyVisibilityOverrides = DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  ): OperationDetailDto {
    return {
      ...this.mapRow(row, viewer, overrides),
      noMedications: row.noMedications,
      medications: row.medications.map((m) => this.mapMed(m)),
      documents: row.documents.map((d) => this.mapDoc(d)),
    };
  }

  async getOne(tenantId: string, id: string, viewer: JwtUser): Promise<OperationDetailDto> {
    const row = await this.prisma.operation.findFirst({
      where: { id, tenantId },
      include: {
        ...operationInclude,
        medications: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, row);
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return this.mapDetailRow(row, viewer, moneyVis);
  }

  async resetClinical(
    tenantId: string,
    operationId: string,
    viewer: JwtUser,
    opts?: { clearPrescription?: boolean },
  ): Promise<{ ok: true }> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);
    this.ensureEditableStatus(op.status);

    await this.prisma.operationMedication.deleteMany({ where: { tenantId, operationId } });
    if (opts?.clearPrescription !== false) {
      await this.deletePrescriptionDocuments(tenantId, operationId);
    }
    // Always return JSON — empty 200 bodies break web clients that call response.json().
    return { ok: true as const };
  }

  async list(
    tenantId: string,
    user: JwtUser,
    fromStr?: string,
    toStr?: string,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    clinicIdStr?: string,
    statusStr?: string,
    patientIdStr?: string,
    isContractStr?: string,
  ) {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(pageStr, pageSizeStr);
      return paginate([], 0, page, pageSize);
    }

    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(
      sortByStr,
      ["operationDate", "totalCost", "downPayment", "createdAt", "status"] as const,
      "operationDate"
    );
    const sortDir = parseSortOrder(sortOrderStr);

    const and: Prisma.OperationWhereInput[] = [{ tenantId }];

    const { start, end } = resolveReportingRange(fromStr, toStr);
    and.push({ operationDate: { gte: start, lte: end } });

    if (hasRole(user, UserRole.PHYSICIAN)) {
      and.push({ clinicianId: user.userId });
    }

    const st = statusStr?.trim().toUpperCase();
    if (st && (Object.values(OperationStatus) as string[]).includes(st)) {
      and.push({ status: st as OperationStatus });
    }

    const patientId = patientIdStr?.trim();
    if (patientId) {
      and.push({ patientId });
    }

    const contractFilter = isContractStr?.trim().toLowerCase();
    if (contractFilter === "true" || contractFilter === "1" || contractFilter === "contract") {
      and.push({ isContract: true });
    } else if (
      contractFilter === "false" ||
      contractFilter === "0" ||
      contractFilter === "standard" ||
      contractFilter === "non_contract"
    ) {
      and.push({ isContract: false });
    }

    const clinicId = clinicIdStr?.trim();
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }

    const where: Prisma.OperationWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.operation.count({ where }),
      this.prisma.operation.findMany({
        where,
        include: operationInclude,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
      }),
    ]);
    const moneyVis = await this.moneyOverrides(tenantId, user);
    return paginate(rows.map((r) => this.mapRow(r, user, moneyVis)), total, page, pageSize);
  }

  async summary(
    tenantId: string,
    user: JwtUser,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    isContractStr?: string,
  ) {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      return {
        totalOperations: 0,
        revenueByCurrency: [] as { currency: string; paidTotal: number; contractTotal: number }[],
        byClinic: [] as {
          clinicId: string;
          clinicNameEn: string;
          clinicNameAr: string;
          feeCurrency: string;
          operationCount: number;
          paidTotal: number;
          contractTotal: number;
        }[],
        operations: [] as {
          id: string;
          operationDate: string;
          clinicId: string;
          clinicNameEn: string;
          clinicNameAr: string;
          patientLabel: string;
          paidAmount: number;
          totalCost: number;
          feeCurrency: string;
        }[],
      };
    }

    const and: Prisma.OperationWhereInput[] = [{ tenantId }];
    const { start, end } = resolveReportingRange(fromStr, toStr);
    and.push({ operationDate: { gte: start, lte: end } });
    if (hasRole(user, UserRole.PHYSICIAN)) {
      and.push({ clinicianId: user.userId });
    }
    const contractFilter = isContractStr?.trim().toLowerCase();
    if (contractFilter === "true" || contractFilter === "1" || contractFilter === "contract") {
      and.push({ isContract: true });
    } else if (
      contractFilter === "false" ||
      contractFilter === "0" ||
      contractFilter === "standard" ||
      contractFilter === "non_contract"
    ) {
      and.push({ isContract: false });
    }
    const clinicId = clinicIdStr?.trim();
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }
    const where: Prisma.OperationWhereInput = { AND: and };

    const [totalOperations, revenueGroups, clinicGroups, rows] = await Promise.all([
      this.prisma.operation.count({ where }),
      this.prisma.operation.groupBy({
        by: ["feeCurrency"],
        where,
        _sum: { paidAmount: true, totalCost: true },
      }),
      this.prisma.operation.groupBy({
        by: ["clinicId", "feeCurrency"],
        where,
        _sum: { paidAmount: true, totalCost: true },
        _count: { _all: true },
      }),
      this.prisma.operation.findMany({
        where,
        select: {
          id: true,
          operationDate: true,
          totalCost: true,
          paidAmount: true,
          feeCurrency: true,
          isContract: true,
          clinicId: true,
          clinic: { select: { nameEn: true, nameAr: true } },
          patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        },
        orderBy: { operationDate: "desc" },
        take: 300,
      }),
    ]);

    const revenueByCurrency = revenueGroups
      .map((g) => ({
        currency: g.feeCurrency,
        paidTotal: Number(g._sum.paidAmount ?? 0),
        contractTotal: Number(g._sum.totalCost ?? 0),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    const clinicIds = [...new Set(clinicGroups.map((g) => g.clinicId))];
    const clinicNames = clinicIds.length
      ? await this.prisma.clinic.findMany({
          where: { tenantId, id: { in: clinicIds } },
          select: { id: true, nameEn: true, nameAr: true },
        })
      : [];
    const clinicNameById = new Map(clinicNames.map((c) => [c.id, c]));

    const byClinic = clinicGroups
      .map((g) => {
        const names = clinicNameById.get(g.clinicId);
        return {
          clinicId: g.clinicId,
          clinicNameEn: names?.nameEn ?? "—",
          clinicNameAr: names?.nameAr ?? "—",
          feeCurrency: g.feeCurrency,
          operationCount: g._count._all,
          paidTotal: Number(g._sum.paidAmount ?? 0),
          contractTotal: Number(g._sum.totalCost ?? 0),
        };
      })
      .sort((a, b) => b.operationCount - a.operationCount);

    const moneyVis = await this.moneyOverrides(tenantId, user);
    const hideMoney = !operationSummaryFinancialsVisibleForViewer(user, moneyVis);
    const operations = rows.map((r) => ({
      id: r.id,
      operationDate: r.operationDate.toISOString(),
      clinicId: r.clinicId,
      clinicNameEn: r.clinic.nameEn,
      clinicNameAr: r.clinic.nameAr,
      patientLabel: `${r.patient.mrn} — ${r.patient.firstNameEn} ${r.patient.lastNameEn}`.trim(),
      paidAmount: hideMoney ? 0 : Number(r.paidAmount),
      totalCost: hideMoney ? 0 : Number(r.totalCost),
      feeCurrency: r.feeCurrency,
      isContract: r.isContract,
    }));

    if (hideMoney) {
      return {
        totalOperations,
        revenueByCurrency: [],
        byClinic: byClinic.map((c) => ({ ...c, paidTotal: 0, contractTotal: 0 })),
        operations,
      };
    }

    return { totalOperations, revenueByCurrency, byClinic, operations };
  }

  /**
   * Same patient + same performing doctor + same calendar day (tenant local date from the ISO timestamp),
   * excluding cancelled operations. Used as a duplicate-booking guard before create.
   */
  async findSameDayDuplicates(
    tenantId: string,
    user: JwtUser,
    patientId: string,
    clinicianId: string,
    operationDateIso: string,
    excludeOperationId?: string,
  ): Promise<OperationDto[]> {
    const operationDate = new Date(operationDateIso);
    if (Number.isNaN(operationDate.getTime())) {
      throw new BadRequestException("Invalid operation date");
    }
    const dayStart = new Date(operationDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const moneyVis = await this.moneyOverrides(tenantId, user);
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    const and: Prisma.OperationWhereInput[] = [
      { tenantId },
      { patientId },
      { clinicianId },
      { status: { not: OperationStatus.CANCELLED } },
      { operationDate: { gte: dayStart, lt: dayEnd } },
    ];
    if (excludeOperationId) and.push({ id: { not: excludeOperationId } });
    if (scopeIds !== null) {
      if (!scopeIds.length) return [];
      and.push({ clinicId: { in: scopeIds } });
    }

    const rows = await this.prisma.operation.findMany({
      where: { AND: and },
      include: operationInclude,
      orderBy: { operationDate: "asc" },
      take: 20,
    });
    return rows.map((r) => this.mapRow(r, user, moneyVis));
  }

  async create(tenantId: string, dto: CreateOperationDto, user: JwtUser): Promise<OperationDto> {
    const moneyVis = await this.moneyOverrides(tenantId, user);
    const feesDeferred = !canEditOperationFeesForViewer(user, moneyVis);
    if (feesDeferred) {
      dto = { ...dto, totalCost: 0, downPayment: 0 };
    }
    const totalCost = dto.totalCost ?? 0;
    const downPayment = dto.downPayment ?? 0;
    const isContract = Boolean(dto.isContract);
    assertOperationContractCost({ totalCost, isContract, feesDeferred });
    if (downPayment > totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
      select: { id: true, homeBranchId: true, firstNameEn: true, lastNameEn: true, mrn: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const clinician = await this.prisma.user.findFirst({
      where: { id: dto.clinicianId, tenantId, role: UserRole.PHYSICIAN },
      select: { id: true, displayName: true },
    });
    if (!clinician) throw new BadRequestException("Clinician must be a physician in your organization");

    let clinicId = dto.clinicId?.trim();
    if (!clinicId) {
      clinicId = patient.homeBranchId ?? undefined;
    }
    if (!clinicId) {
      const first = await this.prisma.clinic.findFirst({
        where: { tenantId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      clinicId = first?.id;
    }
    if (!clinicId) throw new BadRequestException("No clinic available for this operation");

    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true } });
    if (!clinic) throw new BadRequestException("Clinic not found");

    const tenantSettings = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { operationAcquisitionRequired: true },
    });
    assertOperationAcquisition(dto, Boolean(tenantSettings?.operationAcquisitionRequired));

    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(clinicId)) {
      throw new ForbiddenException("Clinic is outside your assigned scope");
    }

    const operationDate = new Date(dto.operationDate);
    if (Number.isNaN(operationDate.getTime())) {
      throw new BadRequestException("Invalid operation date");
    }

    const feeCurrency = await this.resolveOperationFeeCurrency(tenantId, clinicId, dto.feeCurrency);

    const row = await this.prisma.$transaction(async (tx) => {
      if (hasPatientAcquisitionInput(dto)) {
        await tx.patient.update({
          where: { id: dto.patientId },
          data: patientAcquisitionUpdateData(dto),
        });
      }

      const op = await tx.operation.create({
        data: {
          tenantId,
          clinicId,
          patientId: dto.patientId,
          clinicianId: dto.clinicianId,
          createdByUserId: user.userId,
          operationDate,
          totalCost,
          downPayment,
          paidAmount: downPayment,
          feeCurrency,
          isContract,
          acquisitionChannel: dto.acquisitionChannel ?? null,
          comments: dto.comments?.trim() || null,
          status: OperationStatus.BOOKED,
          noMedications: dto.noMedications ?? false,
        },
        include: operationInclude,
      });
      if (downPayment > 0) {
        const patientName = `${patient.firstNameEn} ${patient.lastNameEn}`.trim();
        const clinicianName = clinician.displayName?.trim() || dto.clinicianId;
        await postRevenue(tx, {
          tenantId,
          clinicId,
          patientId: dto.patientId,
          operationId: op.id,
          category: "OPERATION_PAYMENT",
          description: `Operation down payment · ${patientName} · ${clinicianName}`,
          grossAmount: downPayment,
          taxAmount: 0,
          netAmount: downPayment,
          currency: feeCurrency,
        });
      }
      return op;
    });
    return this.mapRow(row, user, moneyVis);
  }

  async listPayable(tenantId: string, user: JwtUser, clinicIdStr?: string): Promise<OperationDto[]> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) return [];

    const and: Prisma.OperationWhereInput[] = [
      { tenantId },
      { status: { not: OperationStatus.CANCELLED } },
    ];

    if (hasRole(user, UserRole.PHYSICIAN)) {
      and.push({ clinicianId: user.userId });
    }

    const clinicId = clinicIdStr?.trim();
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: scopeIds } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }

    const rows = await this.prisma.operation.findMany({
      where: { AND: and },
      include: operationInclude,
      orderBy: { operationDate: "desc" },
      take: 200,
    });

    const moneyVis = await this.moneyOverrides(tenantId, user);
    return rows
      .filter((r) => Number(r.paidAmount) + 0.001 < Number(r.totalCost))
      .map((r) => this.mapRow(r, user, moneyVis));
  }

  private operationRevenueDescription(patientName: string, clinicianName: string): string {
    return `Operation · ${patientName} · ${clinicianName}`;
  }

  private async resolveNamesForOperation(
    tenantId: string,
    patientId: string,
    clinicianId: string,
  ): Promise<{ patientName: string; clinicianName: string }> {
    const [patient, clinician] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: patientId, tenantId },
        select: { firstNameEn: true, lastNameEn: true },
      }),
      this.prisma.user.findFirst({
        where: { id: clinicianId, tenantId },
        select: {
          displayName: true,
          employee: { select: { firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
        },
      }),
    ]);
    const patientName = patient
      ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim()
      : patientId;
    const clinicianName = this.clinicianDisplayName(clinician) ?? clinicianId;
    return { patientName, clinicianName };
  }

  async update(tenantId: string, id: string, dto: UpdateOperationDto, viewer: JwtUser): Promise<OperationDto> {
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    const existing = await this.prisma.operation.findFirst({
      where: { id, tenantId },
      include: operationInclude,
    });
    if (!existing) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, existing);
    assertMayApplyOperationUpdate(viewer, dto);

    if (
      !canEditOperationFeesForViewer(viewer, moneyVis) &&
      (dto.totalCost !== undefined ||
        dto.downPayment !== undefined ||
        dto.feeCurrency !== undefined ||
        dto.isContract !== undefined)
    ) {
      throw new ForbiddenException("You do not have permission to edit operation fees");
    }

    if (existing.status === OperationStatus.CANCELLED) {
      throw new BadRequestException("Cancelled operations cannot be edited");
    }

    if (existing.status === OperationStatus.COMPLETED) {
      if (!canAdminEditCompletedOperation(viewer.role)) {
        throw new ForbiddenException("Only administrators can edit completed operations");
      }
      return this.updateCompletedAsAdmin(tenantId, id, existing, dto, viewer);
    }

    const totalCost = dto.totalCost ?? Number(existing.totalCost);
    const downPayment = dto.downPayment ?? Number(existing.downPayment);
    const isContract = dto.isContract ?? existing.isContract;
    assertOperationContractCost({ totalCost, isContract });
    if (downPayment > totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    let paidAmount = Number(existing.paidAmount);
    if (dto.downPayment !== undefined) {
      const oldDown = Number(existing.downPayment);
      const newDown = dto.downPayment;
      if (Math.abs(paidAmount - oldDown) < 0.001) {
        paidAmount = newDown;
      } else {
        paidAmount = paidAmount + (newDown - oldDown);
      }
    }
    if (paidAmount > totalCost + 0.001) {
      throw new BadRequestException("Paid amount cannot exceed total cost");
    }
    if (paidAmount < 0) {
      throw new BadRequestException("Paid amount cannot be negative");
    }

    const fields = await this.resolveOperationUpdateFields(tenantId, existing, dto, viewer);
    const feeCurrency =
      dto.feeCurrency !== undefined
        ? await this.resolveOperationFeeCurrency(tenantId, fields.clinicId, dto.feeCurrency)
        : existing.feeCurrency;

    const paymentDelta =
      dto.downPayment !== undefined ? paidAmount - Number(existing.paidAmount) : 0;

    const row = await this.prisma.$transaction(async (tx) => {
      const op = await tx.operation.update({
        where: { id },
        data: {
          ...fields,
          totalCost,
          downPayment,
          paidAmount,
          feeCurrency,
          isContract,
          ...(dto.noMedications !== undefined ? { noMedications: dto.noMedications } : {}),
        },
        include: operationInclude,
      });
      if (paymentDelta > 0.001) {
        const { patientName, clinicianName } = await this.resolveNamesForOperation(
          tenantId,
          op.patientId,
          op.clinicianId,
        );
        await postRevenue(tx, {
          tenantId,
          clinicId: op.clinicId,
          patientId: op.patientId,
          operationId: op.id,
          category: "OPERATION_PAYMENT",
          description: `Operation payment · ${patientName} · ${clinicianName}`,
          grossAmount: paymentDelta,
          taxAmount: 0,
          netAmount: paymentDelta,
          currency: feeCurrency,
        });
      }
      return op;
    });
    return this.mapRow(row, viewer, moneyVis);
  }

  private async resolveOperationUpdateFields(
    tenantId: string,
    existing: OperationRow,
    dto: UpdateOperationDto,
    viewer: JwtUser,
  ): Promise<{
    clinicId: string;
    patientId: string;
    clinicianId: string;
    operationDate: Date;
    comments: string | null;
  }> {
    let clinicId = existing.clinicId;
    if (dto.clinicId?.trim()) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { id: dto.clinicId.trim(), tenantId },
        select: { id: true },
      });
      if (!clinic) throw new BadRequestException("Clinic not found");
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
      if (scopeIds !== null && !scopeIds.includes(clinic.id)) {
        throw new ForbiddenException("Clinic is outside your assigned scope");
      }
      clinicId = clinic.id;
    }

    let patientId = existing.patientId;
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException("Patient not found");
      patientId = patient.id;
    }

    let clinicianId = existing.clinicianId;
    if (dto.clinicianId) {
      const clinician = await this.prisma.user.findFirst({
        where: { id: dto.clinicianId, tenantId, role: UserRole.PHYSICIAN },
        select: { id: true },
      });
      if (!clinician) throw new BadRequestException("Clinician must be a physician in your organization");
      clinicianId = clinician.id;
    }

    let operationDate = existing.operationDate;
    if (dto.operationDate) {
      const d = new Date(dto.operationDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestException("Invalid operation date");
      operationDate = d;
    }

    return {
      clinicId,
      patientId,
      clinicianId,
      operationDate,
      comments: dto.comments !== undefined ? dto.comments.trim() || null : existing.comments,
    };
  }

  private async updateCompletedAsAdmin(
    tenantId: string,
    id: string,
    existing: OperationRow,
    dto: UpdateOperationDto,
    viewer: JwtUser,
  ): Promise<OperationDto> {
    const totalCost = dto.totalCost ?? Number(existing.totalCost);
    const downPayment = dto.downPayment ?? Number(existing.downPayment);
    const isContract = dto.isContract ?? existing.isContract;
    assertOperationContractCost({ totalCost, isContract });
    if (totalCost <= 0 && !isZeroCostAllowedForComplete(totalCost, isContract)) {
      throw new BadRequestException("Operation total cost must be greater than zero");
    }
    if (downPayment > totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    const fields = await this.resolveOperationUpdateFields(tenantId, existing, dto, viewer);
    const feeCurrency =
      dto.feeCurrency !== undefined
        ? await this.resolveOperationFeeCurrency(tenantId, fields.clinicId, dto.feeCurrency)
        : existing.feeCurrency;
    const { patientName, clinicianName } = await this.resolveNamesForOperation(
      tenantId,
      fields.patientId,
      fields.clinicianId,
    );
    const description = this.operationRevenueDescription(patientName, clinicianName);

    const row = await this.prisma.$transaction(async (tx) => {
      if (totalCost > 0) {
        await syncPostedOperationContractRevenue(tx, tenantId, id, {
          clinicId: fields.clinicId,
          description,
          grossAmount: totalCost,
          netAmount: totalCost,
          currency: feeCurrency,
        });
      }
      return tx.operation.update({
        where: { id },
        data: {
          ...fields,
          totalCost,
          downPayment,
          paidAmount: totalCost,
          feeCurrency,
          isContract,
        },
        include: operationInclude,
      });
    });
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return this.mapRow(row, viewer, moneyVis);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: OperationStatus,
    viewer: JwtUser,
    collectionAmount?: number,
    options?: { allowPipelineSkip?: boolean },
  ): Promise<OperationDto> {
    assertCanCompleteOperation(viewer, status);
    const existing = await this.prisma.operation.findFirst({
      where: { id, tenantId },
      include: operationInclude,
    });
    if (!existing) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, existing);
    const moneyVis = await this.moneyOverrides(tenantId, viewer);

    if (existing.status === status) {
      return this.mapRow(existing, viewer, moneyVis);
    }

    assertOperationStatusTransition(existing.status, status, {
      allowPipelineSkip: options?.allowPipelineSkip,
    });
    assertDownPaymentBeforeInProgress(existing, status);

    const completesRevenue =
      status === OperationStatus.COMPLETED ||
      status === OperationStatus.DISCHARGED ||
      normalizeOperationStatus(status) === OperationStatus.DISCHARGED;

    if (completesRevenue) {
      const total = Number(existing.totalCost);
      const paid = Number(existing.paidAmount);
      const remaining = Math.max(0, total - paid);
      if (total <= 0 && !isZeroCostAllowedForComplete(total, existing.isContract)) {
        throw new BadRequestException("Operation total cost must be greater than zero to complete");
      }

      const currency = existing.feeCurrency;

      if (remaining > 0.001) {
        if (collectionAmount === undefined || collectionAmount <= 0) {
          throw new BadRequestException("Collect the remaining balance before completing this operation");
        }
        if (Math.abs(collectionAmount - remaining) > 0.001) {
          throw new BadRequestException(
            `Collected amount must equal the remaining balance (${remaining.toFixed(2)} ${currency})`
          );
        }
      }

      const patientName = existing.patient
        ? `${existing.patient.firstNameEn} ${existing.patient.lastNameEn}`.trim()
        : existing.patientId;
      const clinicianName = this.clinicianDisplayName(existing.clinician ?? null) ?? existing.clinicianId;

      const row = await this.prisma.$transaction(async (tx) => {
        if (remaining > 0.001) {
          await postRevenue(tx, {
            tenantId,
            clinicId: existing.clinicId,
            patientId: existing.patientId,
            operationId: id,
            category: "OPERATION_PAYMENT",
            description: `Operation balance at discharge · ${patientName} · ${clinicianName}`,
            grossAmount: remaining,
            taxAmount: 0,
            netAmount: remaining,
            currency,
          });
        }
        await voidPostedRevenuesWithFiscalReturns(
          tx,
          tenantId,
          { operationId: id, category: "OPERATION" },
          "Return",
        );
        return tx.operation.update({
          where: { id },
          data: { status: OperationStatus.DISCHARGED, paidAmount: total },
          include: operationInclude,
        });
      });
      return this.mapRow(row, viewer, moneyVis);
    }

    if (status === OperationStatus.CANCELLED) {
      const row = await this.prisma.$transaction(async (tx) => {
        await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { operationId: id }, "Return");
        return tx.operation.update({
          where: { id },
          data: { status: OperationStatus.CANCELLED, paidAmount: 0 },
          include: operationInclude,
        });
      });
      return this.mapRow(row, viewer, moneyVis);
    }

  const row = await this.prisma.operation.update({
      where: { id },
      data: { status },
      include: operationInclude,
    });
    return this.mapRow(row, viewer, moneyVis);
  }

  async addMedication(
    tenantId: string,
    operationId: string,
    dto: AddOperationMedicationDto,
    viewer: JwtUser,
  ): Promise<OperationMedicationDto> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);
    this.ensureEditableStatus(op.status);

    const m = await this.prisma.operationMedication.create({
      data: {
        tenantId,
        operationId,
        drugName: dto.drugName.trim(),
        dosage: dto.dosage?.trim() || null,
        route: dto.route?.trim() || null,
        frequency: dto.frequency?.trim() || null,
        duration: dto.duration?.trim() || null,
        instructions: dto.instructions?.trim() || null,
      },
    });
    await this.prisma.operation.update({
      where: { id: operationId },
      data: { noMedications: false },
    });
    return this.mapMed(m);
  }

  async uploadDocument(
    tenantId: string,
    operationId: string,
    kind: OperationDocumentKind,
    description: string | undefined,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    viewer: JwtUser,
    options?: { replaceDocumentId?: string | null },
  ): Promise<OperationDocumentDto> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);
    this.assertCanUploadDocument(kind, op.status);

    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException("File too large (max 25MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const desc = description?.trim() || null;
    const needsDescription =
      kind === OperationDocumentKind.ATTACHMENT ||
      kind === OperationDocumentKind.POST_SURGERY ||
      kind === OperationDocumentKind.CONSENT ||
      kind === OperationDocumentKind.OPERATION_NOTE;
    if (needsDescription && !desc) {
      throw new BadRequestException("Document description is required");
    }

    const replaceDocumentId = options?.replaceDocumentId?.trim() || null;
    if (replaceDocumentId) {
      const existing = await this.prisma.operationDocument.findFirst({
        where: { id: replaceDocumentId, operationId, tenantId, kind },
      });
      if (!existing) throw new NotFoundException("Document to replace not found");
      await this.prisma.operationDocument.delete({ where: { id: existing.id } });
      await this.uploads.deleteObject("operations", existing.relativePath).catch(() => undefined);
      await adjustTenantStorageBytes(this.prisma, tenantId, -existing.sizeBytes);
    }

    // Prescriptions are additive (multiple files per operation). Only "no medications"
    // / reset-clinical clears all Rx docs — never wipe siblings on a normal upload.
    if (kind === OperationDocumentKind.PRESCRIPTION) {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { noMedications: false },
      });
    }

    const docId = randomUUID();
    const base = path.basename(file.originalname || "upload").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "upload";
    const relativePath = `${tenantId}/${operationId}/${docId}-${base}`;
    await this.uploads.put("operations", relativePath, file.buffer, mime);

    const row = await this.prisma.operationDocument.create({
      data: {
        id: docId,
        tenantId,
        operationId,
        kind,
        description: needsDescription ? desc : null,
        originalFileName: file.originalname || base,
        mimeType: mime,
        sizeBytes: file.size,
        relativePath,
        originalSizeBytes: file.size,
        processingStatus: "NONE",
      },
    });
    await adjustTenantStorageBytes(this.prisma, tenantId, file.size);
    void this.documentProcessing.enqueueProcessDocument(tenantId, "OperationDocument", row.id);
    return this.mapDoc(row);
  }

  async removeDocument(
    tenantId: string,
    operationId: string,
    documentId: string,
    viewer: JwtUser,
  ): Promise<void> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);

    const doc = await this.prisma.operationDocument.findFirst({
      where: { id: documentId, operationId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    this.assertCanUploadDocument(doc.kind, op.status);
    await this.prisma.operationDocument.delete({ where: { id: documentId } });
    await this.uploads.deleteObject("operations", doc.relativePath).catch(() => undefined);
    await adjustTenantStorageBytes(this.prisma, tenantId, -doc.sizeBytes);
  }

  async setNoMedications(tenantId: string, operationId: string, noMedications: boolean, viewer: JwtUser): Promise<void> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);
    this.ensureEditableStatus(op.status);

    if (noMedications) {
      await this.clearMedicationData(tenantId, operationId);
    }
    await this.prisma.operation.update({
      where: { id: operationId },
      data: { noMedications },
    });
  }

  async getDocumentFileMeta(
    tenantId: string,
    operationId: string,
    documentId: string,
    viewer: JwtUser,
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    await this.assertOperationAccess(viewer, op);
    const doc = await this.prisma.operationDocument.findFirst({
      where: { id: documentId, operationId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.uploads.assertExists("operations", doc.relativePath);
    return { storageKey: doc.relativePath, mimeType: doc.mimeType, originalFileName: doc.originalFileName };
  }

  openDocumentReadStream(storageKey: string) {
    return this.uploads.getReadStream("operations", storageKey);
  }

  async createForIntegration(
    tenantId: string,
    dto: CreateOperationDto & {
      clinicId: string;
      integrationClientId: string;
      externalReference?: string;
    },
  ): Promise<OperationDto> {
    if (dto.externalReference) {
      const existing = await this.prisma.operation.findFirst({
        where: {
          tenantId,
          integrationClientId: dto.integrationClientId,
          externalReference: dto.externalReference,
        },
        include: operationInclude,
      });
      if (existing) return this.mapRow(existing);
    }

    const totalCost = dto.totalCost ?? 0;
    const downPayment = dto.downPayment ?? 0;
    const isContract = Boolean(dto.isContract);
    assertOperationContractCost({ totalCost, isContract });
    if (downPayment > totalCost) {
      throw new BadRequestException("Down payment cannot exceed total cost");
    }

    const [clinic, patient, clinician] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
        select: { id: true },
      }),
      findActiveSchedulingPhysician(this.prisma, tenantId, dto.clinicianId),
    ]);
    if (!clinic || !patient || !clinician) {
      throw new BadRequestException("Invalid clinic, patient, or clinician");
    }

    const tenantSettings = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { operationAcquisitionRequired: true },
    });
    assertOperationAcquisition(dto, Boolean(tenantSettings?.operationAcquisitionRequired));

    const operationDate = new Date(dto.operationDate);
    if (Number.isNaN(operationDate.getTime())) {
      throw new BadRequestException("Invalid operation date");
    }

    const feeCurrency = await this.resolveOperationFeeCurrency(tenantId, dto.clinicId, dto.feeCurrency);

    const patientRow = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
      select: { firstNameEn: true, lastNameEn: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      if (hasPatientAcquisitionInput(dto)) {
        await tx.patient.update({
          where: { id: dto.patientId },
          data: patientAcquisitionUpdateData(dto),
        });
      }

      const op = await tx.operation.create({
        data: {
          tenantId,
          clinicId: dto.clinicId,
          patientId: dto.patientId,
          clinicianId: dto.clinicianId,
          createdByUserId: null,
          operationDate,
          totalCost,
          downPayment,
          paidAmount: downPayment,
          feeCurrency,
          isContract,
          acquisitionChannel: dto.acquisitionChannel ?? null,
          comments: dto.comments?.trim() || null,
          status: OperationStatus.BOOKED,
          noMedications: dto.noMedications ?? false,
          integrationClientId: dto.integrationClientId,
          externalReference: dto.externalReference ?? null,
        },
        include: operationInclude,
      });
      if (downPayment > 0 && patientRow) {
        const patientName = `${patientRow.firstNameEn} ${patientRow.lastNameEn}`.trim();
        await postRevenue(tx, {
          tenantId,
          clinicId: dto.clinicId,
          patientId: dto.patientId,
          operationId: op.id,
          category: "OPERATION_PAYMENT",
          description: `Operation down payment · ${patientName}`,
          grossAmount: downPayment,
          taxAmount: 0,
          netAmount: downPayment,
          currency: feeCurrency,
        });
      }
      return op;
    });
    return this.mapRow(row);
  }

  async getByIdForIntegration(tenantId: string, id: string, integrationClientId: string): Promise<OperationDto> {
    const row = await this.prisma.operation.findFirst({
      where: { id, tenantId, integrationClientId },
      include: operationInclude,
    });
    if (!row) throw new NotFoundException("Operation not found");
    return this.mapRow(row);
  }

  async cancelForIntegration(tenantId: string, id: string, integrationClientId: string): Promise<OperationDto> {
    const existing = await this.prisma.operation.findFirst({
      where: { id, tenantId, integrationClientId },
      include: operationInclude,
    });
    if (!existing) throw new NotFoundException("Operation not found");
    if (existing.status === OperationStatus.COMPLETED) {
      throw new BadRequestException("Cannot cancel a completed operation");
    }
    if (existing.status === OperationStatus.CANCELLED) {
      return this.mapRow(existing);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { operationId: id }, "Return");
      return tx.operation.update({
        where: { id },
        data: { status: OperationStatus.CANCELLED, paidAmount: 0 },
        include: operationInclude,
      });
    });
    return this.mapRow(row);
  }

  private static DEFAULT_PREOP = [
    { labelEn: "Identity confirmed", labelAr: "تأكيد الهوية" },
    { labelEn: "Consent signed on tablet", labelAr: "توقيع الموافقة على الجهاز اللوحي" },
    { labelEn: "NPO / fasting verified", labelAr: "تحقق الصيام" },
    { labelEn: "Surgical site marked", labelAr: "تحديد موقع العملية" },
  ];

  async ensurePreOpChecklist(tenantId: string, operationId: string) {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    const count = await this.prisma.operationPreOpCheckItem.count({ where: { operationId } });
    if (count > 0) {
      return this.prisma.operationPreOpCheckItem.findMany({ where: { operationId }, orderBy: { sortOrder: "asc" } });
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (let idx = 0; idx < OperationsService.DEFAULT_PREOP.length; idx++) {
        const item = OperationsService.DEFAULT_PREOP[idx];
        rows.push(
          await tx.operationPreOpCheckItem.create({
            data: { tenantId, operationId, labelEn: item.labelEn, labelAr: item.labelAr, sortOrder: idx },
          }),
        );
      }
      return rows;
    });
  }

  async completePreOpItem(tenantId: string, operationId: string, itemId: string, userId: string) {
    const item = await this.prisma.operationPreOpCheckItem.findFirst({ where: { id: itemId, tenantId, operationId } });
    if (!item) throw new NotFoundException("Checklist item not found");
    return this.prisma.operationPreOpCheckItem.update({
      where: { id: itemId },
      data: { completedAt: new Date(), completedByUserId: userId },
    });
  }

  async addSupply(tenantId: string, operationId: string, body: { itemName: string; quantity?: number; unit?: string; catalogCode?: string }) {
    return this.prisma.operationSupplyUsed.create({
      data: {
        tenantId,
        operationId,
        itemName: body.itemName.trim(),
        quantity: body.quantity ?? 1,
        unit: body.unit?.trim() || "unit",
        catalogCode: body.catalogCode?.trim() || null,
      },
    });
  }

  async setInstallments(tenantId: string, operationId: string, rows: { dueOn: string; amount: number }[]) {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.operationInstallment.deleteMany({ where: { operationId, tenantId } });
      if (!rows.length) return [];
      return Promise.all(
        rows.map((r) =>
          tx.operationInstallment.create({
            data: {
              tenantId,
              operationId,
              dueOn: new Date(r.dueOn),
              amount: new Prisma.Decimal(String(r.amount)),
            },
          }),
        ),
      );
    });
  }

  async saveOperationNote(tenantId: string, operationId: string, note: Record<string, unknown>) {
    const op = await this.prisma.operation.findFirst({ where: { id: operationId, tenantId } });
    if (!op) throw new NotFoundException("Operation not found");
    return this.prisma.operation.update({
      where: { id: operationId },
      data: { operationNote: note as Prisma.InputJsonValue },
    });
  }
}
