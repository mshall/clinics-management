import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  EncounterDocumentKind,
  EncounterFollowUpStatus,
  EncounterStatus,
  Prisma,
  UserRole,
  VisitCollectionMode,
  type TransferVerificationStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import * as path from "path";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { assertOrgClinicalDeleteRole } from "../common/org-clinical-delete-roles";
import { resolveLedgerListingRange } from "../common/reporting-range";
import { paginate, parsePageParams } from "../common/pagination";
import type { JwtUser } from "../auth/jwt-user";
import { assertActiveSchedulingPhysician } from "../common/active-scheduling-physician";
import { assertClinicianBillingSeatActive } from "../subscriptions/billing-seat-access";
import { CLINIC_SCOPE_ROLES, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { isBaseCurrency } from "../common/base-currencies";
import { resolveClinicCurrency } from "../common/clinic-currency";
import {
  getEncounterVisitFeeReceivableSummary,
  upsertEncounterVisitFeeRevenue,
} from "../common/visit-fee-ledger";
import {
  detachRevenueFromEncounter,
  voidPostedRevenuesWithFiscalReturns,
} from "../compliance/void-revenue-adjustments";
import { parseVisitCollectionForAmount } from "../common/visit-collection";
import { resolveTransferVerification } from "../common/visit-collection-transfer";
import {
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  canEditEncounterFeesForViewer,
  encounterFinancialsVisible,
  loadUserMoneyVisibilityOverrides,
  type UserMoneyVisibilityOverrides,
} from "../common/user-money-visibility";
import { effectiveTenantVisitFee } from "../common/effective-tenant-visit-fee";
import { PrismaService } from "../prisma/prisma.service";
import { FrontDeskFlowService } from "../front-desk/front-desk-flow.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PatientsService } from "../patients/patients.service";
import { assertPatientProfileComplete } from "../patients/patient-profile.guard";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import type { AddDiagnosisDto } from "./dto/add-diagnosis.dto";
import type { AddEncounterMedicationDto } from "./dto/add-encounter-medication.dto";
import type { CreateEncounterDto } from "./dto/create-encounter.dto";
import {
  hasPatientAcquisitionInput,
  patientAcquisitionUpdateData,
  validatePatientAcquisition,
} from "../common/patient-acquisition";
import type {
  DiagnosisDto,
  EncounterDetailDto,
  EncounterDocumentDto,
  EncounterMedicationDto,
} from "./dto/encounter-response.dto";
import type { UpdateEncounterDto } from "./dto/update-encounter.dto";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { AuditService } from "../audit/audit.service";
import { assertEncounterWritable, autoLockHours, encounterLockAt, syncEncounterLock } from "../common/encounter-lock";
import { DrugCatalogService } from "../clinical/drug-catalog.service";
import { RxSafetyCheckService } from "../clinical/rx-safety-check.service";
import { RecordShareService } from "../marketplace/record-share.service";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
]);

const encounterIncludeDef: Prisma.EncounterInclude = {
  diagnoses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
  medications: { orderBy: { createdAt: "asc" } },
  documents: { orderBy: { createdAt: "asc" } },
  clinic: { select: { nameEn: true, nameAr: true } },
  patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
  amendments: { orderBy: { amendedAt: "asc" } },
  signedBy: { select: { displayName: true } },
  tenant: { select: { encounterAutoLockHours: true } },
};

type EncounterRow = Prisma.EncounterGetPayload<{ include: typeof encounterIncludeDef }>;

function isPhysicianRole(role: UserRole | undefined): boolean {
  return role === UserRole.PHYSICIAN || String(role) === "PHYSICIAN";
}

function assertPhysicianEncounterAccess(viewer: JwtUser | undefined, encounter: { clinicianId: string }): void {
  if (viewer && isPhysicianRole(viewer.role) && encounter.clinicianId !== viewer.userId) {
    throw new ForbiddenException("You can only work on encounters assigned to you");
  }
}

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly frontDeskFlow: FrontDeskFlowService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly drugCatalog: DrugCatalogService,
    private readonly rxSafety: RxSafetyCheckService,
    private readonly audit: AuditService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly commissionCharges: CommissionChargeService,
    private readonly recordShare: RecordShareService,
  ) {}

  private mapDiag(d: {
    id: string;
    icd10Code: string;
    descriptionEn: string;
    descriptionAr: string | null;
    isPrimary: boolean;
  }): DiagnosisDto {
    return {
      id: d.id,
      icd10Code: d.icd10Code,
      descriptionEn: d.descriptionEn,
      descriptionAr: d.descriptionAr,
      isPrimary: d.isPrimary,
    };
  }

  private mapMed(m: {
    id: string;
    drugName: string;
    drugProductId: string | null;
    drugUnverified: boolean;
    safetyOverrideReason: string | null;
    dosage: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  }): EncounterMedicationDto {
    return {
      id: m.id,
      drugName: m.drugName,
      drugProductId: m.drugProductId,
      drugUnverified: m.drugUnverified,
      safetyOverrideReason: m.safetyOverrideReason,
      dosage: m.dosage,
      route: m.route,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    };
  }

  private mapDoc(d: {
    id: string;
    kind: EncounterDocumentKind;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }): EncounterDocumentDto {
    return {
      id: d.id,
      kind: d.kind,
      originalFileName: d.originalFileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    };
  }

  private async enrichVisitBalanceDue(
    tenantId: string,
    encounterId: string,
    dto: EncounterDetailDto,
  ): Promise<EncounterDetailDto> {
    if (dto.financialsVisible === false) {
      dto.visitBalanceDueAmount = null;
      dto.visitBalanceDueCurrency = null;
      dto.visitBalanceRevenueId = null;
      return dto;
    }
    const receivable = await getEncounterVisitFeeReceivableSummary(this.prisma, tenantId, encounterId);
    if (receivable) {
      dto.visitBalanceDueAmount = receivable.amount;
      dto.visitBalanceDueCurrency = receivable.currency;
      dto.visitBalanceRevenueId = receivable.revenueEntryId;
    } else {
      dto.visitBalanceDueAmount = null;
      dto.visitBalanceDueCurrency = null;
      dto.visitBalanceRevenueId = null;
    }
    return dto;
  }

  private async moneyOverrides(tenantId: string, viewer?: JwtUser): Promise<UserMoneyVisibilityOverrides> {
    return loadUserMoneyVisibilityOverrides(this.prisma, tenantId, viewer?.userId);
  }

  private mapEncounter(
    e: EncounterRow,
    opts?: { lite?: boolean; viewer?: JwtUser; overrides?: UserMoneyVisibilityOverrides },
  ): EncounterDetailDto {
    const lite = opts?.lite ?? false;
    const overrides = opts?.overrides ?? DEFAULT_MONEY_VISIBILITY_OVERRIDES;
    const financialsVisible = opts?.viewer
      ? encounterFinancialsVisible(opts.viewer, e.clinicianId, overrides)
      : true;
    const patient = e.patient;
    return {
      id: e.id,
      clinicId: e.clinicId,
      clinicNameEn: e.clinic?.nameEn ?? null,
      clinicNameAr: e.clinic?.nameAr ?? null,
      patientId: e.patientId,
      ...(patient
        ? {
            patientMrn: patient.mrn,
            patientName: `${patient.firstNameEn} ${patient.lastNameEn}`.trim(),
          }
        : {}),
      clinicianId: e.clinicianId,
      status: e.status,
      visitType: e.visitType,
      chiefComplaint: e.chiefComplaint,
      subjective: e.subjective,
      objective: e.objective,
      assessment: e.assessment,
      plan: e.plan,
      vitalsJson:
        e.vitalsJson && typeof e.vitalsJson === "object" && !Array.isArray(e.vitalsJson)
          ? (e.vitalsJson as Record<string, unknown>)
          : null,
      heartRate: e.heartRate ?? null,
      spo2: e.spo2 ?? null,
      bpSystolic: e.bpSystolic ?? null,
      bpDiastolic: e.bpDiastolic ?? null,
      temperature: e.temperature != null ? Number(e.temperature) : null,
      weightKg: e.weightKg != null ? Number(e.weightKg) : null,
      heightCm: e.heightCm != null ? Number(e.heightCm) : null,
      noMedications: e.noMedications,
      visitFeeAmount: financialsVisible ? Number(e.visitFeeAmount) : 0,
      visitFeeCurrency: e.visitFeeCurrency,
      financialsVisible,
      appointmentId: e.appointmentId ?? null,
      finalizedAt: e.finalizedAt ? e.finalizedAt.toISOString() : null,
      clinicalTemplateId: e.clinicalTemplateId ?? null,
      specialtyFormResponses:
        e.specialtyFormResponses && typeof e.specialtyFormResponses === "object" && !Array.isArray(e.specialtyFormResponses)
          ? (e.specialtyFormResponses as Record<string, unknown>)
          : null,
      noteLockedAt: e.noteLockedAt ? e.noteLockedAt.toISOString() : null,
      signedAt: e.signedAt ? e.signedAt.toISOString() : null,
      amendReason: e.amendReason ?? null,
      amendedAt: e.amendedAt ? e.amendedAt.toISOString() : null,
      signedByName: e.signedBy?.displayName ?? null,
      noteLocksAt: encounterLockAt(e, autoLockHours(e.tenant.encounterAutoLockHours))?.toISOString() ?? null,
      amendments: e.amendments.map((a) => ({
        id: a.id,
        reason: a.reason,
        amendedByName: a.amendedByName,
        amendedAt: a.amendedAt.toISOString(),
        wasLocked: a.wasLocked,
        resignedByName: a.resignedByName ?? null,
        resignedAt: a.resignedAt ? a.resignedAt.toISOString() : null,
      })),
      followUpDueAt: e.followUpDueAt ? e.followUpDueAt.toISOString() : null,
      followUpWeeks: e.followUpWeeks ?? null,
      followUpNote: e.followUpNote ?? null,
      followUpStatus: e.followUpStatus,
      diagnoses: e.diagnoses.map((d) => this.mapDiag(d)),
      medications: lite ? [] : e.medications.map((m) => this.mapMed(m)),
      documents: lite ? [] : e.documents.map((d) => this.mapDoc(d)),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async listForTenant(
    tenantId: string,
    patientId: string | undefined,
    patientSearchStr: string | undefined,
    fromStr: string | undefined,
    toStr: string | undefined,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    viewer?: JwtUser
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["createdAt", "updatedAt", "visitType", "status"] as const, "createdAt");
    const sortDir = parseSortOrder(sortOrderStr);
    /** Patient chart: show all encounters for the patient (no reporting-period slice). */
    const where: Prisma.EncounterWhereInput = {
      tenantId,
      ...(patientId ? { patientId } : {}),
    };
    if (viewer && isPhysicianRole(viewer.role)) {
      where.clinicianId = viewer.userId;
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.length) {
        return paginate([], 0, page, pageSize);
      }
      where.clinicId = { in: net };
    } else if (viewer && hasAnyRoleInSet(viewer, CLINIC_SCOPE_ROLES)) {
      const scopes = await this.prisma.clinicAdminScope.findMany({
        where: { tenantId, userId: viewer.userId },
        select: { clinicId: true },
      });
      const ids = scopes.map((s) => s.clinicId);
      if (!ids.length) {
        return paginate([], 0, page, pageSize);
      }
      where.clinicId = { in: ids };
    }
    const ps = patientSearchStr?.trim();
    if (ps && !patientId) {
      where.patient = {
        is: {
          deletedAt: null,
          OR: [
            { firstNameEn: { contains: ps, mode: "insensitive" } },
            { lastNameEn: { contains: ps, mode: "insensitive" } },
            { mrn: { contains: ps, mode: "insensitive" } },
          ],
        },
      };
    }
    if (!patientId) {
      const { start, end } = resolveLedgerListingRange(fromStr, toStr);
      where.createdAt = { gte: start, lte: end };
    }
    const [total, rows] = await Promise.all([
      this.prisma.encounter.count({ where }),
      this.prisma.encounter.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: encounterIncludeDef,
      }),
    ]);
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return paginate(
      rows.map((r) => this.mapEncounter(r, { lite: true, viewer, overrides: moneyVis })),
      total,
      page,
      pageSize
    );
  }

  async getById(tenantId: string, id: string, viewer?: JwtUser): Promise<EncounterDetailDto> {
    const row = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
      include: encounterIncludeDef,
    });
    if (!row) throw new NotFoundException("Encounter not found");
    if (viewer && isPhysicianRole(viewer.role) && row.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only open encounters assigned to you");
    }
    await this.applyAutoNoteLockIfDue(tenantId, row.id);
    const fresh = await this.prisma.encounter.findFirst({ where: { id, tenantId }, include: encounterIncludeDef });
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return this.enrichVisitBalanceDue(
      tenantId,
      id,
      this.mapEncounter(fresh ?? row, { viewer, overrides: moneyVis }),
    );
  }

  private async applyAutoNoteLockIfDue(tenantId: string, encounterId: string): Promise<void> {
    await syncEncounterLock(this.prisma, tenantId, encounterId);
  }

  async create(tenantId: string, actor: JwtUser, dto: CreateEncounterDto): Promise<EncounterDetailDto> {
    let clinicianId: string;
    if (isPhysicianRole(actor.role)) {
      clinicianId = actor.userId;
    } else {
      let raw = dto.clinicianId?.trim() || null;
      const aptId = dto.appointmentId?.trim();
      if (!raw && aptId) {
        const apt = await this.prisma.appointment.findFirst({
          where: { id: aptId, tenantId, patientId: dto.patientId },
          select: { clinicianId: true },
        });
        raw = apt?.clinicianId ?? null;
      }
      if (!raw) throw new BadRequestException("clinicianId is required (or link a booked appointment to infer the physician)");
      await assertActiveSchedulingPhysician(this.prisma, tenantId, raw);
      clinicianId = raw;
    }

    const moneyVisCreate = await this.moneyOverrides(tenantId, actor);
    const canSetVisitFees = canEditEncounterFeesForViewer(actor, clinicianId, moneyVisCreate);
    if (!canSetVisitFees) {
      dto.visitFeeAmount = undefined;
      dto.visitFeeCurrency = undefined;
      dto.visitCollection = undefined;
    }

    const [clinic, patient] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId, deletedAt: null } }),
    ]);
    if (!clinic) throw new BadRequestException("Invalid clinicId");
    if (!patient) throw new BadRequestException("Invalid patientId");
    await assertPatientProfileComplete(this.prisma, tenantId, dto.patientId);

    if (hasPatientAcquisitionInput(dto)) {
      validatePatientAcquisition(dto);
    }

    const appointmentIdOpt = dto.appointmentId?.trim() || null;

    const tenantRow = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultVisitFee: true, market: true },
    });
    const orgDefaultVisitFee = effectiveTenantVisitFee(
      tenantRow ?? { defaultVisitFee: null },
      tenantRow?.market ?? null,
    );
    const visitFeeCurrencyPreview = await this.resolveVisitFeeCurrency(tenantId, dto.clinicId, dto.visitFeeCurrency);
    let linkedAppointmentFeePreview: number | null = null;
    if (appointmentIdOpt) {
      const apt = await this.prisma.appointment.findFirst({
        where: { id: appointmentIdOpt, tenantId },
        select: { feeAmount: true },
      });
      linkedAppointmentFeePreview = apt ? Number(apt.feeAmount) : null;
    }
    const visitFeeFromDtoPreview =
      dto.visitFeeAmount !== undefined && dto.visitFeeAmount !== null ? Number(dto.visitFeeAmount) : null;
    const visitFeePreview =
      visitFeeFromDtoPreview != null && Number.isFinite(visitFeeFromDtoPreview) && visitFeeFromDtoPreview >= 0
        ? visitFeeFromDtoPreview
        : linkedAppointmentFeePreview != null && linkedAppointmentFeePreview >= 0
          ? linkedAppointmentFeePreview
          : orgDefaultVisitFee;
    const { resolveTenantTransferCollectionContext } = await import("../common/market-transfer-context");
    const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
    const collectionOpts = {
      allowedTransferChannels: transferCtx.allowedTransferChannels,
      paymentMethods: transferCtx.paymentMethods,
    };
    const visitCollectionPreview = parseVisitCollectionForAmount(
      visitFeePreview,
      dto.visitCollection ??
        (visitFeePreview > 0 ? { mode: VisitCollectionMode.CASH_ON_VISIT } : undefined),
      collectionOpts,
    );
    let transferVerificationStatus: TransferVerificationStatus | undefined;
    if (
      visitCollectionPreview.transferChannel &&
      visitCollectionPreview.transferReference &&
      visitFeePreview > 0
    ) {
      transferVerificationStatus = await resolveTransferVerification(
        visitCollectionPreview.transferChannel,
        visitCollectionPreview.transferReference,
        visitFeePreview,
        visitFeeCurrencyPreview,
        transferCtx.paymentMethods,
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, include: { market: true } });
      if (!tenant) throw new BadRequestException("Tenant not found");
      const defaultFee = effectiveTenantVisitFee(tenant, tenant.market);

      let linkAppointmentId: string | null = null;
      let linkedAppointmentFee: number | null = null;
      if (appointmentIdOpt) {
        const apt = await tx.appointment.findFirst({
          where: { id: appointmentIdOpt, tenantId, patientId: dto.patientId },
        });
        if (!apt) throw new BadRequestException("Appointment not found for this patient");
        const linkableStatuses = new Set<AppointmentStatus>([
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.CHECKED_IN,
        ]);
        if (!linkableStatuses.has(apt.status)) {
          throw new BadRequestException("This appointment cannot be linked to a new encounter");
        }
        const existingDraft = await tx.encounter.findFirst({
          where: {
            appointmentId: appointmentIdOpt,
            tenantId,
            status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
          },
        });
        if (existingDraft) {
          throw new BadRequestException("An open encounter is already linked to this appointment");
        }
        linkAppointmentId = appointmentIdOpt;
        linkedAppointmentFee = Number(apt.feeAmount);
      }

      const visitFeeFromDto =
        dto.visitFeeAmount !== undefined && dto.visitFeeAmount !== null ? Number(dto.visitFeeAmount) : null;
      const visitFeeAmount =
        visitFeeFromDto != null && Number.isFinite(visitFeeFromDto) && visitFeeFromDto >= 0
          ? visitFeeFromDto
          : linkedAppointmentFee != null && linkedAppointmentFee >= 0
            ? linkedAppointmentFee
            : defaultFee;

      const visitFeeCurrency = await this.resolveVisitFeeCurrency(
        tenantId,
        dto.clinicId,
        dto.visitFeeCurrency,
      );

      const enc = await tx.encounter.create({
        data: {
          tenantId,
          clinicId: dto.clinicId,
          patientId: dto.patientId,
          clinicianId,
          visitType: dto.visitType,
          chiefComplaint: dto.chiefComplaint ?? null,
          status: EncounterStatus.DRAFT,
          visitFeeAmount,
          visitFeeCurrency,
          appointmentId: linkAppointmentId,
        },
        include: encounterIncludeDef,
      });

      if (linkAppointmentId) {
        await tx.appointment.update({
          where: { id: linkAppointmentId },
          data: { feeAmount: visitFeeAmount },
        });
        await this.frontDeskFlow.onEncounterStarted(tx, tenantId, linkAppointmentId);
      }

      const visitCollection =
        visitFeeAmount === visitFeePreview
          ? visitCollectionPreview
          : parseVisitCollectionForAmount(
              visitFeeAmount,
              dto.visitCollection ??
                (visitFeeAmount > 0 ? { mode: VisitCollectionMode.CASH_ON_VISIT } : undefined),
              collectionOpts,
            );

      await upsertEncounterVisitFeeRevenue(tx, {
        tenantId,
        clinicId: dto.clinicId,
        encounterId: enc.id,
        appointmentId: linkAppointmentId,
        amount: visitFeeAmount,
        currency: visitFeeCurrency,
        collection: visitCollection,
        patientId: dto.patientId,
        transferVerificationStatus,
        clinicTaxRin: clinic.taxRegistrationNumber,
        vatPercent: Number(clinic.invoiceVatPercent ?? 0),
      });

      if (hasPatientAcquisitionInput(dto)) {
        await tx.patient.update({
          where: { id: dto.patientId },
          data: patientAcquisitionUpdateData(dto),
        });
      }

      return enc;
    });
    if (dto.patientAllergies?.length) {
      await this.patients.mergePatientAllergies(tenantId, dto.patientId, actor, dto.patientAllergies, row.id);
    }
    const moneyVis = await this.moneyOverrides(tenantId, actor);
    return this.enrichVisitBalanceDue(
      tenantId,
      row.id,
      this.mapEncounter(row, { viewer: actor, overrides: moneyVis }),
    );
  }

  private async ensureEditableEncounter(enc: { id: string; tenantId: string }) {
    await assertEncounterWritable(this.prisma, enc.tenantId, enc.id);
  }

  private ensureEditable(status: EncounterStatus) {
    if (status === EncounterStatus.FINALIZED) {
      throw new BadRequestException("Encounter is finalized and cannot be edited");
    }
  }

  private assertCanUploadEncounterDocument(kind: EncounterDocumentKind, status: EncounterStatus): void {
    if (kind === EncounterDocumentKind.LAB || kind === EncounterDocumentKind.RADIOLOGY) {
      if (
        status === EncounterStatus.DRAFT ||
        status === EncounterStatus.AMENDED ||
        status === EncounterStatus.FINALIZED
      ) {
        return;
      }
      throw new BadRequestException("Lab and radiology uploads require a draft, amended, or finalized encounter");
    }
    this.ensureEditable(status);
  }

  async amend(tenantId: string, viewer: JwtUser, encounterId: string, reason: string): Promise<EncounterDetailDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    if (enc.status !== EncounterStatus.FINALIZED) {
      throw new BadRequestException("Only finalized encounters can be amended");
    }
    if (!hasAnyRole(viewer, [UserRole.GROUP_SUPERVISOR, UserRole.GROUP_ADMIN]) && enc.clinicianId !== viewer.userId) {
      throw new ForbiddenException("Only the assigned clinician or a supervisor can amend a signed note");
    }
    const trimmed = reason.trim();
    if (trimmed.length < 3) throw new BadRequestException("Amend reason is required");
    const wasLocked = Boolean(await syncEncounterLock(this.prisma, tenantId, encounterId));
    const author = await this.prisma.user.findFirst({
      where: { id: viewer.userId, tenantId },
      select: { displayName: true },
    });
    const amendedAt = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.encounterAmendment.create({
        data: {
          tenantId,
          encounterId,
          reason: trimmed,
          amendedByUserId: viewer.userId,
          amendedByName: author?.displayName ?? "",
          amendedAt,
          wasLocked,
        },
      });
      return tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.AMENDED,
          amendReason: trimmed,
          amendedByUserId: viewer.userId,
          amendedAt,
          noteLockedAt: null,
        },
        include: encounterIncludeDef,
      });
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: viewer.userId,
      clinicId: enc.clinicId,
      action: "ENCOUNTER_AMENDED",
      resource: "Encounter",
      resourceId: encounterId,
      metadata: { reason: trimmed, wasLocked, previousSignedAt: enc.signedAt?.toISOString() ?? null },
    });
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return this.mapEncounter(row, { viewer, overrides: moneyVis });
  }

  private async deletePrescriptionDocuments(tenantId: string, encounterId: string): Promise<void> {
    const docs = await this.prisma.encounterDocument.findMany({
      where: { tenantId, encounterId, kind: EncounterDocumentKind.PRESCRIPTION },
    });
    if (docs.length === 0) return;
    await this.prisma.encounterDocument.deleteMany({
      where: { tenantId, encounterId, kind: EncounterDocumentKind.PRESCRIPTION },
    });
    await Promise.all(docs.map((d) => this.uploads.deleteObject("encounters", d.relativePath)));
  }

  async update(tenantId: string, id: string, dto: UpdateEncounterDto, viewer?: JwtUser): Promise<EncounterDetailDto> {
    const existing = await this.prisma.encounter.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, existing);
    await this.ensureEditableEncounter(existing);
    const moneyVis = viewer ? await this.moneyOverrides(tenantId, viewer) : DEFAULT_MONEY_VISIBILITY_OVERRIDES;

    const data: Prisma.EncounterUpdateInput = {};
    if (dto.visitType !== undefined) data.visitType = dto.visitType;
    if (dto.chiefComplaint !== undefined) data.chiefComplaint = dto.chiefComplaint;
    if (dto.subjective !== undefined) data.subjective = dto.subjective;
    if (dto.objective !== undefined) data.objective = dto.objective;
    if (dto.assessment !== undefined) data.assessment = dto.assessment;
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.vitalsJson !== undefined) data.vitalsJson = dto.vitalsJson as Prisma.InputJsonValue;
    if (dto.heartRate !== undefined) data.heartRate = dto.heartRate;
    if (dto.spo2 !== undefined) data.spo2 = dto.spo2;
    if (dto.bpSystolic !== undefined) data.bpSystolic = dto.bpSystolic;
    if (dto.bpDiastolic !== undefined) data.bpDiastolic = dto.bpDiastolic;
    if (dto.temperature !== undefined) {
      data.temperature = new Prisma.Decimal(String(dto.temperature));
    }
    if (dto.weightKg !== undefined) {
      data.weightKg = new Prisma.Decimal(String(dto.weightKg));
    }
    if (dto.heightCm !== undefined) {
      data.heightCm = new Prisma.Decimal(String(dto.heightCm));
    }
    if (dto.clinicalTemplateId !== undefined) {
      data.clinicalTemplate = dto.clinicalTemplateId
        ? { connect: { id: dto.clinicalTemplateId } }
        : { disconnect: true };
    }
    if (dto.specialtyFormResponses !== undefined) {
      data.specialtyFormResponses = dto.specialtyFormResponses as Prisma.InputJsonValue;
    }
    if (dto.followUpWeeks !== undefined) {
      if (dto.followUpWeeks <= 0) {
        data.followUpWeeks = null;
        data.followUpDueAt = null;
        data.followUpStatus = EncounterFollowUpStatus.NONE;
      } else {
        data.followUpWeeks = dto.followUpWeeks;
        const due = new Date();
        due.setDate(due.getDate() + dto.followUpWeeks * 7);
        data.followUpDueAt = due;
        data.followUpStatus = EncounterFollowUpStatus.PENDING_BOOKING;
      }
    }
    if (dto.followUpNote !== undefined) {
      data.followUpNote = dto.followUpNote?.trim() || null;
    }
    if (dto.noMedications !== undefined) {
      data.noMedications = dto.noMedications;
      if (dto.noMedications) {
        await this.prisma.encounterMedication.deleteMany({ where: { encounterId: id, tenantId } });
        await this.deletePrescriptionDocuments(tenantId, id);
      }
    }

    const visitFeeProvided = dto.visitFeeAmount !== undefined && dto.visitFeeAmount !== null;
    const visitFeeCurrencyProvided = dto.visitFeeCurrency !== undefined;
    const collectionProvided = dto.visitCollection !== undefined;
    if (
      viewer &&
      (visitFeeProvided || visitFeeCurrencyProvided || collectionProvided) &&
      !canEditEncounterFeesForViewer(viewer, existing.clinicianId, moneyVis)
    ) {
      throw new ForbiddenException("You do not have permission to edit encounter visit fees");
    }
    if (visitFeeCurrencyProvided) {
      data.visitFeeCurrency = await this.resolveVisitFeeCurrency(
        tenantId,
        existing.clinicId,
        dto.visitFeeCurrency,
      );
    }
    if (visitFeeProvided) {
      const newFee = Number(dto.visitFeeAmount);
      if (!Number.isFinite(newFee) || newFee < 0) {
        throw new BadRequestException("visitFeeAmount must be a non-negative number");
      }
      data.visitFeeAmount = new Prisma.Decimal(String(newFee));
    }

    if (visitFeeProvided || visitFeeCurrencyProvided || collectionProvided) {
      const newFee = visitFeeProvided ? Number(dto.visitFeeAmount) : Number(existing.visitFeeAmount);
      const priorRevenue = await this.prisma.revenueEntry.findFirst({
        where: { tenantId, encounterId: id, category: "VISIT_FEE" },
      });
      const { resolveTenantTransferCollectionContext } = await import("../common/market-transfer-context");
      const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
      const collectionOpts = {
        allowedTransferChannels: transferCtx.allowedTransferChannels,
        paymentMethods: transferCtx.paymentMethods,
      };
      let visitCollection: ReturnType<typeof parseVisitCollectionForAmount>;
      const priorCollected =
        priorRevenue?.collectionMode != null && Number(priorRevenue.grossAmount ?? 0) > 0;
      const priorPaid = priorRevenue ? Number(priorRevenue.grossAmount) : 0;
      if (dto.visitCollection !== undefined) {
        if (priorCollected && newFee > priorPaid + 0.001) {
          visitCollection = { collectionMode: null, transferChannel: null, transferReference: null };
        } else if (priorCollected) {
          visitCollection = {
            collectionMode: priorRevenue!.collectionMode,
            transferChannel: priorRevenue.transferChannel,
            transferReference: priorRevenue.transferReference,
          };
        } else {
          visitCollection = parseVisitCollectionForAmount(newFee, dto.visitCollection, collectionOpts);
        }
      } else if (newFee > 0 && priorRevenue?.collectionMode) {
        visitCollection = {
          collectionMode: priorRevenue.collectionMode,
          transferChannel: priorRevenue.transferChannel,
          transferReference: priorRevenue.transferReference,
        };
      } else {
        visitCollection = parseVisitCollectionForAmount(newFee, undefined, collectionOpts);
      }
      const clinicRow = await this.prisma.clinic.findFirst({
        where: { id: existing.clinicId, tenantId },
        select: { taxRegistrationNumber: true, invoiceVatPercent: true },
      });
      let transferVerificationStatus: TransferVerificationStatus | undefined;
      const feeIncreaseAfterPayment = priorCollected && newFee > priorPaid + 0.001;
      if (
        !feeIncreaseAfterPayment &&
        visitCollection.transferChannel &&
        visitCollection.transferReference &&
        newFee > 0
      ) {
        const feeCurrency =
          data.visitFeeCurrency !== undefined
            ? String(data.visitFeeCurrency)
            : existing.visitFeeCurrency;
        transferVerificationStatus = await resolveTransferVerification(
          visitCollection.transferChannel,
          visitCollection.transferReference,
          newFee,
          feeCurrency,
          transferCtx.paymentMethods,
        );
      }
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.encounter.update({
          where: { id },
          data,
          include: encounterIncludeDef,
        });

        await upsertEncounterVisitFeeRevenue(tx, {
          tenantId,
          clinicId: existing.clinicId,
          encounterId: id,
          appointmentId: existing.appointmentId,
          amount: newFee,
          currency: updated.visitFeeCurrency,
          collection: visitCollection,
          patientId: existing.patientId,
          transferVerificationStatus,
          clinicTaxRin: clinicRow?.taxRegistrationNumber,
          vatPercent: Number(clinicRow?.invoiceVatPercent ?? 0),
        });

        if (existing.appointmentId && visitFeeProvided) {
          await tx.appointment.update({
            where: { id: existing.appointmentId },
            data: { feeAmount: new Prisma.Decimal(String(newFee)) },
          });
        }

        return updated;
      });
      return this.enrichVisitBalanceDue(
        tenantId,
        id,
        this.mapEncounter(row, { viewer, overrides: moneyVis }),
      );
    }

    const row = await this.prisma.encounter.update({
      where: { id },
      data,
      include: encounterIncludeDef,
    });
    return this.mapEncounter(row, { viewer, overrides: moneyVis });
  }

  async addDiagnosis(
    tenantId: string,
    encounterId: string,
    dto: AddDiagnosisDto,
    viewer?: JwtUser
  ): Promise<DiagnosisDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    this.ensureEditable(enc.status);

    if (dto.isPrimary) {
      await this.prisma.diagnosis.updateMany({
        where: { encounterId, tenantId },
        data: { isPrimary: false },
      });
    }

    const d = await this.prisma.diagnosis.create({
      data: {
        tenantId,
        encounterId,
        icd10Code: dto.icd10Code.trim(),
        descriptionEn: dto.descriptionEn,
        descriptionAr: dto.descriptionAr ?? null,
        isPrimary: dto.isPrimary ?? false,
      },
    });
    return this.mapDiag(d);
  }

  async removeDiagnosis(
    tenantId: string,
    encounterId: string,
    diagnosisId: string,
    viewer?: JwtUser
  ): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    this.ensureEditable(enc.status);

    const res = await this.prisma.diagnosis.deleteMany({
      where: { id: diagnosisId, encounterId, tenantId },
    });
    if (res.count === 0) throw new NotFoundException("Diagnosis not found");
  }

  async addMedication(
    tenantId: string,
    encounterId: string,
    dto: AddEncounterMedicationDto,
    viewer?: JwtUser
  ): Promise<EncounterMedicationDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    await this.ensureEditableEncounter(enc);

    const marketId = await this.drugCatalog.resolveMarketIdForTenant(tenantId);
    let drugName = dto.drugName.trim();
    let drugProductId: string | null = dto.drugProductId?.trim() || null;
    let drugUnverified = false;
    if (drugProductId) {
      const product = await this.prisma.drugProduct.findFirst({
        where: { id: drugProductId, marketId, isActive: true },
      });
      if (!product) throw new BadRequestException("Drug product not found in market catalog");
      drugName = this.drugCatalog.formatPrintedDrugName(product);
    } else {
      drugUnverified = true;
    }

    const existingMeds = await this.prisma.encounterMedication.findMany({
      where: { encounterId, tenantId },
      select: { drugName: true, drugProductId: true },
    });
    const items = [
      ...existingMeds.map((m) => ({ drugName: m.drugName, drugProductId: m.drugProductId })),
      { drugName, drugProductId },
    ];
    const safety = await this.rxSafety.checkRx(tenantId, enc.patientId, items);
    const blocking = safety.alerts.filter((a) => a.requiresOverride);
    const overrideReason = dto.safetyOverrideReason?.trim() || null;
    if (blocking.length > 0 && !overrideReason) {
      throw new BadRequestException({
        message: "Documented override required for major or contraindicated medication alerts",
        errorCode: "RX_SAFETY_OVERRIDE_REQUIRED",
        alerts: blocking,
      });
    }
    if (overrideReason && blocking.length > 0) {
      await this.audit.recordEvent({
        tenantId,
        actorId: viewer?.userId ?? null,
        clinicId: enc.clinicId,
        action: "RX_SAFETY_OVERRIDE",
        resource: "Encounter",
        resourceId: encounterId,
        metadata: { patientId: enc.patientId, reason: overrideReason, alerts: blocking, drugName },
      });
    }

    const m = await this.prisma.encounterMedication.create({
      data: {
        tenantId,
        encounterId,
        drugName,
        drugProductId,
        drugUnverified,
        safetyOverrideReason: overrideReason,
        dosage: dto.dosage?.trim() || null,
        route: dto.route?.trim() || null,
        frequency: dto.frequency?.trim() || null,
        duration: dto.duration?.trim() || null,
        instructions: dto.instructions?.trim() || null,
      },
    });
    if (drugProductId && enc.clinicianId) {
      await this.drugCatalog.recordClinicianUsage(tenantId, enc.clinicianId, drugProductId);
    }
    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { noMedications: false },
    });
    return this.mapMed(m);
  }

  async removeMedication(
    tenantId: string,
    encounterId: string,
    medicationId: string,
    viewer?: JwtUser
  ): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    this.ensureEditable(enc.status);
    const res = await this.prisma.encounterMedication.deleteMany({
      where: { id: medicationId, encounterId, tenantId },
    });
    if (res.count === 0) throw new NotFoundException("Medication not found");
  }

  async uploadDocument(
    tenantId: string,
    encounterId: string,
    kind: EncounterDocumentKind,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    viewer?: JwtUser
  ): Promise<EncounterDocumentDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    this.assertCanUploadEncounterDocument(kind, enc.status);
    await this.ensureEditableEncounter(enc);

    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    if (kind === EncounterDocumentKind.PRESCRIPTION) {
      await this.deletePrescriptionDocuments(tenantId, encounterId);
      await this.prisma.encounter.update({
        where: { id: encounterId },
        data: { noMedications: false },
      });
    }

    const docId = randomUUID();
    const base = path.basename(file.originalname || "upload").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "upload";
    const relativePath = `${tenantId}/${encounterId}/${docId}-${base}`;
    await this.uploads.put("encounters", relativePath, file.buffer, mime);

    const row = await this.prisma.encounterDocument.create({
      data: {
        id: docId,
        tenantId,
        encounterId,
        kind,
        originalFileName: file.originalname || base,
        mimeType: mime,
        sizeBytes: file.size,
        relativePath,
      },
    });
    return this.mapDoc(row);
  }

  async getDocumentFileMeta(
    tenantId: string,
    encounterId: string,
    documentId: string,
    viewer?: JwtUser
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    const doc = await this.prisma.encounterDocument.findFirst({
      where: { id: documentId, encounterId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.uploads.assertExists("encounters", doc.relativePath);
    return { storageKey: doc.relativePath, mimeType: doc.mimeType, originalFileName: doc.originalFileName };
  }

  openDocumentReadStream(storageKey: string) {
    return this.uploads.getReadStream("encounters", storageKey);
  }

  async removeDocument(tenantId: string, encounterId: string, documentId: string, viewer?: JwtUser): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    assertPhysicianEncounterAccess(viewer, enc);
    this.ensureEditable(enc.status);

    const doc = await this.prisma.encounterDocument.findFirst({
      where: { id: documentId, encounterId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.encounterDocument.delete({ where: { id: documentId } });
    await this.uploads.deleteObject("encounters", doc.relativePath);
  }

  async finalize(tenantId: string, viewer: JwtUser, encounterId: string): Promise<EncounterDetailDto> {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      include: { medications: true, documents: true },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    if (enc.status === EncounterStatus.FINALIZED) {
      throw new BadRequestException("Already finalized");
    }
    if (enc.clinicianId) {
      await assertClinicianBillingSeatActive(this.prisma, tenantId, enc.clinicianId);
    }
    const canFinalizeAny =
      hasAnyRole(viewer, [UserRole.GROUP_SUPERVISOR, UserRole.GROUP_ADMIN]);
    if (!canFinalizeAny && enc.clinicianId !== viewer.userId) {
      throw new ForbiddenException("Only the assigned clinician can finalize this encounter");
    }
    const prescriptionCount = enc.documents.filter((d) => d.kind === EncounterDocumentKind.PRESCRIPTION).length;
    const hasManualMeds = enc.medications.length > 0;
    const hasPrescription = prescriptionCount > 0;
    if (!enc.noMedications && !hasManualMeds && !hasPrescription) {
      throw new BadRequestException(
        'Add at least one medication, upload a prescription, or enable "no medications prescribed"'
      );
    }
    if (enc.noMedications && (hasManualMeds || hasPrescription)) {
      throw new BadRequestException('Remove medications/prescription or disable "no medications prescribed"');
    }

    const aptId = enc.appointmentId;
    if (aptId) {
      const { assertScheduledTransferFeeCollected } = await import("../appointments/appointment-transfer-fee.guard");
      await assertScheduledTransferFeeCollected(this.prisma, tenantId, aptId);
    }
    const finalizedAt = new Date();

    const followPatch =
      enc.followUpWeeks && enc.followUpWeeks > 0 && !enc.followUpDueAt
        ? (() => {
            const due = new Date(finalizedAt);
            due.setDate(due.getDate() + enc.followUpWeeks! * 7);
            return {
              followUpDueAt: due,
              followUpStatus: EncounterFollowUpStatus.PENDING_BOOKING,
            };
          })()
        : enc.followUpWeeks && enc.followUpWeeks > 0
          ? { followUpStatus: EncounterFollowUpStatus.PENDING_BOOKING }
          : {};

    const signer =
      enc.status === EncounterStatus.AMENDED
        ? await this.prisma.user.findFirst({ where: { id: viewer.userId, tenantId }, select: { displayName: true } })
        : null;
    const row = await this.prisma.$transaction(async (tx) => {
      if (enc.status === EncounterStatus.AMENDED) {
        await tx.encounterAmendment.updateMany({
          where: { tenantId, encounterId, resignedAt: null },
          data: { resignedAt: finalizedAt, resignedByUserId: viewer.userId, resignedByName: signer?.displayName ?? "" },
        });
      }
      const updated = await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.FINALIZED,
          finalizedAt,
          signedAt: finalizedAt,
          signedByUserId: viewer.userId,
          ...followPatch,
        },
        include: encounterIncludeDef,
      });
      if (aptId) {
        await this.frontDeskFlow.onEncounterEnded(tx, aptId);
        await tx.appointment.update({
          where: { id: aptId },
          data: { status: AppointmentStatus.COMPLETED, endsAt: finalizedAt },
        });
        await this.commissionCharges.onComplete(tx, tenantId, aptId);
      }
      return updated;
    });
    // KX-11 — share signed visit / Rx with Kiorex only when patient consented to those scopes.
    try {
      void this.recordShare.shareAfterSignOff(tenantId, encounterId).catch(() => undefined);
    } catch {
      /* tests may inject a stub without shareAfterSignOff */
    }
    const moneyVis = await this.moneyOverrides(tenantId, viewer);
    return this.enrichVisitBalanceDue(
      tenantId,
      encounterId,
      this.mapEncounter(row, { viewer, overrides: moneyVis }),
    );
  }

  private assertCanDeleteEncounter(viewer: JwtUser): void {
    assertOrgClinicalDeleteRole(viewer, "encounters");
  }

  async delete(tenantId: string, id: string, viewer: JwtUser): Promise<{ ok: true; id: string }> {
    this.assertCanDeleteEncounter(viewer);
    const enc = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
      include: { documents: true },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    await this.ensureEditableEncounter(enc);

    const documentPaths = enc.documents.map((d) => d.relativePath);
    const appointmentId = enc.appointmentId;

    await this.prisma.$transaction(async (tx) => {
      await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { encounterId: id }, "Return");
      await detachRevenueFromEncounter(tx, tenantId, id);
      await tx.encounter.delete({ where: { id } });

      if (appointmentId) {
        const otherEnc = await tx.encounter.findFirst({
          where: { tenantId, appointmentId, id: { not: id } },
        });
        if (!otherEnc) {
          const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
          if (apt && (apt.status === AppointmentStatus.CHECKED_IN || apt.status === AppointmentStatus.COMPLETED)) {
            await this.frontDeskFlow.onEncounterCancelled(tx, tenantId, appointmentId);
            await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentStatus.CHECKED_IN },
            });
          }
        }
      }
    });

    await Promise.all(
      documentPaths.map((path) => this.uploads.deleteObject("encounters", path).catch(() => undefined)),
    );

    return { ok: true, id };
  }

  private async resolveVisitFeeCurrency(
    tenantId: string,
    clinicId: string,
    currency?: string,
  ): Promise<string> {
    const code = currency?.trim();
    if (code) {
      if (!isBaseCurrency(code)) throw new BadRequestException("Invalid visit fee currency");
      return code;
    }
    return resolveClinicCurrency(this.prisma, tenantId, clinicId);
  }
}
