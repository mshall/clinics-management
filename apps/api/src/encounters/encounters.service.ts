import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  EncounterDocumentKind,
  EncounterStatus,
  Prisma,
  RevenueStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { resolveReportingRange } from "../common/reporting-range";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { AddDiagnosisDto } from "./dto/add-diagnosis.dto";
import type { AddEncounterMedicationDto } from "./dto/add-encounter-medication.dto";
import type { CreateEncounterDto } from "./dto/create-encounter.dto";
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
};

type EncounterRow = Prisma.EncounterGetPayload<{ include: typeof encounterIncludeDef }>;

@Injectable()
export class EncountersService {
  constructor(private readonly prisma: PrismaService) {}

  private uploadRoot(): string {
    return path.join(process.cwd(), "uploads", "encounters");
  }

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
    return {
      id: e.id,
      clinicId: e.clinicId,
      patientId: e.patientId,
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
    sortOrderStr?: string
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["createdAt", "updatedAt", "visitType", "status"] as const, "createdAt");
    const sortDir = parseSortOrder(sortOrderStr);
    /** Patient chart: show all encounters for the patient (no reporting-period slice). */
    const where: Prisma.EncounterWhereInput = {
      tenantId,
      ...(patientId ? { patientId } : {}),
    };
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
      const { start, end } = resolveReportingRange(fromStr, toStr);
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

  async getById(tenantId: string, id: string): Promise<EncounterDetailDto> {
    const row = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
      include: encounterIncludeDef,
    });
    if (!row) throw new NotFoundException("Encounter not found");
    return this.mapEncounter(row);
  }

  async create(tenantId: string, clinicianId: string, dto: CreateEncounterDto): Promise<EncounterDetailDto> {
    const [clinic, patient] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId, deletedAt: null } }),
    ]);
    if (!clinic) throw new BadRequestException("Invalid clinicId");
    if (!patient) throw new BadRequestException("Invalid patientId");

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

      return enc;
    });
    return this.mapEncounter(row);
  }

  private ensureEditable(status: EncounterStatus) {
    if (status === EncounterStatus.FINALIZED) {
      throw new BadRequestException("Encounter is finalized and cannot be edited");
    }
  }

  async update(tenantId: string, id: string, dto: UpdateEncounterDto): Promise<EncounterDetailDto> {
    const existing = await this.prisma.encounter.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Encounter not found");
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
      }
    }

    const row = await this.prisma.encounter.update({
      where: { id },
      data,
      include: encounterIncludeDef,
    });
    return this.mapEncounter(row);
  }

  async addDiagnosis(tenantId: string, encounterId: string, dto: AddDiagnosisDto): Promise<DiagnosisDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
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

  async removeDiagnosis(tenantId: string, encounterId: string, diagnosisId: string): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    this.ensureEditable(enc.status);

    const res = await this.prisma.diagnosis.deleteMany({
      where: { id: diagnosisId, encounterId, tenantId },
    });
    if (res.count === 0) throw new NotFoundException("Diagnosis not found");
  }

  async addMedication(
    tenantId: string,
    encounterId: string,
    dto: AddEncounterMedicationDto
  ): Promise<EncounterMedicationDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
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

  async removeMedication(tenantId: string, encounterId: string, medicationId: string): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
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
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ): Promise<EncounterDocumentDto> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    this.ensureEditable(enc.status);

    if (!file?.buffer?.length) throw new BadRequestException("Missing file");
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const docId = randomUUID();
    const base = path.basename(file.originalname || "upload").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "upload";
    const relativePath = `${tenantId}/${encounterId}/${docId}-${base}`;
    const abs = path.join(this.uploadRoot(), tenantId, encounterId, `${docId}-${base}`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);

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

  async getDocumentAbsolutePath(
    tenantId: string,
    encounterId: string,
    documentId: string
  ): Promise<{ absolutePath: string; mimeType: string; originalFileName: string }> {
    const doc = await this.prisma.encounterDocument.findFirst({
      where: { id: documentId, encounterId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    const absolutePath = path.join(this.uploadRoot(), doc.relativePath);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException("File missing on disk");
    }
    return { absolutePath, mimeType: doc.mimeType, originalFileName: doc.originalFileName };
  }

  getDocumentReadStream(absolutePath: string) {
    return createReadStream(absolutePath);
  }

  async removeDocument(tenantId: string, encounterId: string, documentId: string): Promise<void> {
    const enc = await this.prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!enc) throw new NotFoundException("Encounter not found");
    this.ensureEditable(enc.status);

    const doc = await this.prisma.encounterDocument.findFirst({
      where: { id: documentId, encounterId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    const abs = path.join(this.uploadRoot(), doc.relativePath);
    await this.prisma.encounterDocument.delete({ where: { id: documentId } });
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  async finalize(tenantId: string, userId: string, encounterId: string): Promise<EncounterDetailDto> {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      include: { medications: true },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    if (enc.status === EncounterStatus.FINALIZED) {
      throw new BadRequestException("Already finalized");
    }
    if (enc.clinicianId !== userId) {
      throw new ForbiddenException("Only the assigned clinician can finalize this encounter");
    }
    if (!enc.noMedications && enc.medications.length === 0) {
      throw new BadRequestException('Add at least one medication or enable "no medications prescribed"');
    }
    if (enc.noMedications && enc.medications.length > 0) {
      throw new BadRequestException('Remove medications or disable "no medications prescribed"');
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
}
