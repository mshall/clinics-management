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
  EncounterStatus,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "crypto";
import * as path from "path";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { assertOrgClinicalDeleteRole } from "../common/org-clinical-delete-roles";
import { resolveLedgerListingRange } from "../common/reporting-range";
import { paginate, parsePageParams } from "../common/pagination";
import type { JwtUser } from "../auth/jwt-user";
import { CLINIC_SCOPE_ROLES, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { PrismaService } from "../prisma/prisma.service";
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
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
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
    dosage: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  }): EncounterMedicationDto {
    return {
      id: m.id,
      drugName: m.drugName,
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

  private mapEncounter(e: EncounterRow, opts?: { lite?: boolean }): EncounterDetailDto {
    const lite = opts?.lite ?? false;
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
      visitFeeAmount: Number(e.visitFeeAmount),
      appointmentId: e.appointmentId ?? null,
      finalizedAt: e.finalizedAt ? e.finalizedAt.toISOString() : null,
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
    } else if (viewer && CLINIC_SCOPE_ROLES.has(viewer.role)) {
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
    return paginate(
      rows.map((r) => this.mapEncounter(r, { lite: true })),
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
    return this.mapEncounter(row);
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
      const doc = await this.prisma.user.findFirst({
        where: { id: raw, tenantId, role: UserRole.PHYSICIAN },
      });
      if (!doc) throw new BadRequestException("clinicianId must be a physician in this organization");
      clinicianId = raw;
    }

    const [clinic, patient] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId, deletedAt: null } }),
    ]);
    if (!clinic) throw new BadRequestException("Invalid clinicId");
    if (!patient) throw new BadRequestException("Invalid patientId");

    if (hasPatientAcquisitionInput(dto)) {
      validatePatientAcquisition(dto);
    }

    const appointmentIdOpt = dto.appointmentId?.trim() || null;

    const row = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new BadRequestException("Tenant not found");
      const defaultFee = Number(tenant.defaultVisitFee);
      const feeRaw =
        dto.visitFeeAmount !== undefined && dto.visitFeeAmount !== null ? Number(dto.visitFeeAmount) : defaultFee;
      const visitFeeAmount = Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : defaultFee;

      let linkAppointmentId: string | null = null;
      if (appointmentIdOpt) {
        const apt = await tx.appointment.findFirst({
          where: { id: appointmentIdOpt, tenantId, patientId: dto.patientId },
        });
        if (!apt) throw new BadRequestException("Appointment not found for this patient");
        const linkableStatuses = new Set<AppointmentStatus>([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]);
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
      }

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
          appointmentId: linkAppointmentId,
        },
        include: encounterIncludeDef,
      });

      if (linkAppointmentId) {
        await tx.appointment.update({
          where: { id: linkAppointmentId },
          data: { status: AppointmentStatus.CHECKED_IN },
        });
      }

      if (visitFeeAmount > 0) {
        await tx.revenueEntry.create({
          data: {
            tenantId,
            clinicId: dto.clinicId,
            encounterId: enc.id,
            category: "VISIT_FEE",
            description: `Visit fee · encounter ${enc.id.slice(0, 8)}…`,
            grossAmount: visitFeeAmount,
            taxAmount: 0,
            netAmount: visitFeeAmount,
            currency: tenant.baseCurrency,
            postedAt: new Date(),
            status: RevenueStatus.POSTED,
          },
        });
      }

      if (hasPatientAcquisitionInput(dto)) {
        await tx.patient.update({
          where: { id: dto.patientId },
          data: patientAcquisitionUpdateData(dto),
        });
      }

      return enc;
    });
    return this.mapEncounter(row);
  }

  private ensureEditable(status: EncounterStatus) {
    if (status === EncounterStatus.FINALIZED) {
      throw new BadRequestException("Encounter is finalized and cannot be edited");
    }
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
    this.ensureEditable(existing.status);

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
    if (dto.noMedications !== undefined) {
      data.noMedications = dto.noMedications;
      if (dto.noMedications) {
        await this.prisma.encounterMedication.deleteMany({ where: { encounterId: id, tenantId } });
        await this.deletePrescriptionDocuments(tenantId, id);
      }
    }

    const row = await this.prisma.encounter.update({
      where: { id },
      data,
      include: encounterIncludeDef,
    });
    return this.mapEncounter(row);
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
    this.ensureEditable(enc.status);

    const m = await this.prisma.encounterMedication.create({
      data: {
        tenantId,
        encounterId,
        drugName: dto.drugName.trim(),
        dosage: dto.dosage?.trim() || null,
        route: dto.route?.trim() || null,
        frequency: dto.frequency?.trim() || null,
        duration: dto.duration?.trim() || null,
        instructions: dto.instructions?.trim() || null,
      },
    });
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
    this.ensureEditable(enc.status);

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
    const canFinalizeAny =
      viewer.role === UserRole.GROUP_SUPERVISOR || viewer.role === UserRole.GROUP_ADMIN;
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

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.FINALIZED,
          finalizedAt: new Date(),
        },
        include: encounterIncludeDef,
      });
      if (aptId) {
        await tx.appointment.update({
          where: { id: aptId },
          data: { status: AppointmentStatus.COMPLETED },
        });
      }
      return updated;
    });
    return this.mapEncounter(row);
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

    const documentPaths = enc.documents.map((d) => d.relativePath);
    const appointmentId = enc.appointmentId;

    await this.prisma.$transaction(async (tx) => {
      await tx.revenueEntry.deleteMany({ where: { tenantId, encounterId: id } });
      await tx.encounter.delete({ where: { id } });

      if (appointmentId) {
        const otherEnc = await tx.encounter.findFirst({
          where: { tenantId, appointmentId, id: { not: id } },
        });
        if (!otherEnc) {
          const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
          if (
            apt &&
            (apt.status === AppointmentStatus.CHECKED_IN || apt.status === AppointmentStatus.COMPLETED)
          ) {
            await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentStatus.CONFIRMED },
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
}
