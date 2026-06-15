import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Gender, PatientAcquisitionChannel, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import * as path from "node:path";
import type { JwtUser } from "../auth/jwt-user";
import { fetchPatientListClinicScopeIds } from "../common/clinic-scope";
import { PatientDto } from "../common/dto/patient.dto";
import { PatientDocumentDto } from "../common/dto/patient-document.dto";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  hasPatientAcquisitionInput,
  patientAcquisitionUpdateData,
  validatePatientAcquisition,
} from "../common/patient-acquisition";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import type { CreatePatientDto } from "./dto/create-patient.dto";
import type { UpdatePatientDto } from "./dto/update-patient.dto";

const MAX_PATIENT_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_PATIENT_DOC_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

type PatientDocFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

export interface PatientListQuery {
  search?: string;
  mrn?: string;
  phone?: string;
  gender?: string;
  name?: string;
  nationalId?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private mapDoc(d: {
    id: string;
    description: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }): PatientDocumentDto {
    const dto = new PatientDocumentDto();
    dto.id = d.id;
    dto.description = d.description;
    dto.originalFileName = d.originalFileName;
    dto.mimeType = d.mimeType;
    dto.sizeBytes = d.sizeBytes;
    dto.createdAt = d.createdAt.toISOString();
    return dto;
  }

  private map(
    p: {
    id: string;
    mrn: string;
    firstNameEn: string;
    lastNameEn: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
    dob: Date;
    gender: string;
    phone: string;
    email: string | null;
    nationalId: string | null;
    nationalIdDocRelativePath?: string | null;
    acquisitionChannel?: PatientAcquisitionChannel | null;
    acquisitionReferralName?: string | null;
    acquisitionOtherDetail?: string | null;
    homeBranchId: string | null;
    homeBranch: { nameEn: string } | null;
    documents?: {
      id: string;
      description: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
    }[];
  },
    opts?: { includeDocuments?: boolean },
  ): PatientDto {
    const dto = new PatientDto();
    dto.id = p.id;
    dto.mrn = p.mrn;
    dto.firstNameEn = p.firstNameEn;
    dto.lastNameEn = p.lastNameEn;
    dto.firstNameAr = p.firstNameAr;
    dto.lastNameAr = p.lastNameAr;
    const dob = p.dob instanceof Date && !Number.isNaN(p.dob.getTime()) ? p.dob : null;
    if (!dob) {
      this.logger.error(`Patient ${p.id} has invalid dob; fix data in DB`);
      dto.dob = "1900-01-01";
    } else {
      dto.dob = dob.toISOString().slice(0, 10);
    }
    dto.gender = p.gender as PatientDto["gender"];
    dto.phone = p.phone;
    dto.email = p.email;
    dto.nationalId = p.nationalId;
    dto.hasNationalIdDoc = Boolean(p.nationalIdDocRelativePath);
    dto.acquisitionChannel = p.acquisitionChannel ?? null;
    dto.acquisitionReferralName = p.acquisitionReferralName ?? null;
    dto.acquisitionOtherDetail = p.acquisitionOtherDetail ?? null;
    dto.homeBranch = p.homeBranch ? p.homeBranch.nameEn : null;
    dto.homeBranchId = p.homeBranchId;
    if (opts?.includeDocuments && p.documents) {
      dto.documents = p.documents.map((d) => this.mapDoc(d));
    }
    return dto;
  }

  private buildWhere(tenantId: string, q: PatientListQuery, scopeClinicIds: string[] | null): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
    };
    const and: Prisma.PatientWhereInput[] = [];

    if (scopeClinicIds?.length) {
      and.push({
        OR: [{ homeBranchId: { in: scopeClinicIds } }, { encounters: { some: { clinicId: { in: scopeClinicIds } } } }],
      });
    }

    const broad = q.search?.trim() ?? "";
    if (broad.length > 0) {
      const tokens = broad.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        and.push({
          AND: tokens.map((token) => ({
            OR: [
              { mrn: { contains: token, mode: "insensitive" } },
              { firstNameEn: { contains: token, mode: "insensitive" } },
              { lastNameEn: { contains: token, mode: "insensitive" } },
              { firstNameAr: { contains: token, mode: "insensitive" } },
              { lastNameAr: { contains: token, mode: "insensitive" } },
              { phone: { contains: token, mode: "insensitive" } },
              { nationalId: { contains: token, mode: "insensitive" } },
            ],
          })),
        });
      } else {
        and.push({
          OR: [
            { mrn: { contains: broad, mode: "insensitive" } },
            { firstNameEn: { contains: broad, mode: "insensitive" } },
            { lastNameEn: { contains: broad, mode: "insensitive" } },
            { firstNameAr: { contains: broad, mode: "insensitive" } },
            { lastNameAr: { contains: broad, mode: "insensitive" } },
            { phone: { contains: broad, mode: "insensitive" } },
            { nationalId: { contains: broad, mode: "insensitive" } },
          ],
        });
      }
    }

    const mrn = q.mrn?.trim();
    if (mrn) and.push({ mrn: { contains: mrn, mode: "insensitive" } });

    const phone = q.phone?.trim();
    if (phone) and.push({ phone: { contains: phone, mode: "insensitive" } });

    const nationalId = q.nationalId?.trim();
    if (nationalId) and.push({ nationalId: { contains: nationalId, mode: "insensitive" } });

    const name = q.name?.trim();
    if (name) {
      and.push({
        OR: [
          { firstNameEn: { contains: name, mode: "insensitive" } },
          { lastNameEn: { contains: name, mode: "insensitive" } },
          { firstNameAr: { contains: name, mode: "insensitive" } },
          { lastNameAr: { contains: name, mode: "insensitive" } },
        ],
      });
    }

    const g = q.gender?.trim().toUpperCase();
    if (g && (Object.values(Gender) as string[]).includes(g)) {
      and.push({ gender: g as Gender });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  async listPaginated(tenantId: string, q: PatientListQuery, user: JwtUser) {
    const scopeIds = await fetchPatientListClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(q.page, q.pageSize);
      return paginate([], 0, page, pageSize);
    }
    const { page, pageSize, skip } = parsePageParams(q.page, q.pageSize);
    const where = this.buildWhere(tenantId, q, scopeIds);
    const sortField = pickSortField(q.sortBy, ["mrn", "dob", "firstNameEn", "lastNameEn", "createdAt", "gender"] as const, "mrn");
    const sortDir = parseSortOrder(q.sortOrder);
    const [total, rows] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: { homeBranch: { select: { nameEn: true, id: true } } },
      }),
    ]);
    return paginate(rows.map((r) => this.map(r)), total, page, pageSize);
  }

  async getById(tenantId: string, id: string, user: JwtUser): Promise<PatientDto> {
    const scopeIds = await fetchPatientListClinicScopeIds(this.prisma, tenantId, user);
    const row = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        homeBranch: { select: { nameEn: true } },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Patient not found");
    if (scopeIds !== null) {
      if (!scopeIds.length) throw new NotFoundException("Patient not found");
      const homeOk = row.homeBranchId && scopeIds.includes(row.homeBranchId);
      if (!homeOk) {
        const visitOk = await this.prisma.encounter.findFirst({
          where: { tenantId, patientId: id, clinicId: { in: scopeIds } },
          select: { id: true },
        });
        if (!visitOk) throw new NotFoundException("Patient not found");
      }
    }
    return this.map(row, { includeDocuments: true });
  }

  private async nextMrn(tenantId: string): Promise<string> {
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, mrn: { startsWith: "MRN-" } },
      select: { mrn: true },
    });
    let n = 10000;
    for (const r of rows) {
      const m = /^MRN-(\d+)$/.exec(r.mrn);
      if (m) n = Math.max(n, Number.parseInt(m[1], 10));
    }
    return `MRN-${String(n + 1).padStart(5, "0")}`;
  }

  private async assertHomeBranchInScope(tenantId: string, user: JwtUser, homeBranchId: string | null | undefined): Promise<void> {
    if (!homeBranchId) return;
    const scopeIds = await fetchPatientListClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && (!scopeIds.length || !scopeIds.includes(homeBranchId))) {
      throw new ForbiddenException("homeBranchId is outside clinics you manage");
    }
  }

  async create(tenantId: string, dto: CreatePatientDto, user: JwtUser): Promise<PatientDto> {
    await this.assertHomeBranchInScope(tenantId, user, dto.homeBranchId ?? null);
    validatePatientAcquisition(dto);
    if (dto.homeBranchId) {
      const branch = await this.prisma.clinic.findFirst({
        where: { id: dto.homeBranchId, tenantId },
      });
      if (!branch) throw new BadRequestException("Invalid homeBranchId");
    }
    const nationalId = dto.nationalId?.trim() || null;
    if (nationalId) {
      const clash = await this.prisma.patient.findFirst({
        where: { tenantId, nationalId, deletedAt: null },
      });
      if (clash) throw new BadRequestException("nationalId already in use");
    }
    const mrn = await this.nextMrn(tenantId);
    const row = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstNameEn: dto.firstNameEn,
        lastNameEn: dto.lastNameEn,
        firstNameAr: dto.firstNameAr.trim(),
        lastNameAr: dto.lastNameAr.trim(),
        dob: new Date(dto.dob),
        gender: dto.gender,
        phone: dto.phone,
        email: dto.email?.trim() || null,
        nationalId,
        ...patientAcquisitionUpdateData(dto),
        homeBranchId: dto.homeBranchId ?? null,
      },
      include: { homeBranch: { select: { nameEn: true } } },
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdatePatientDto, user: JwtUser): Promise<PatientDto> {
    await this.getById(tenantId, id, user);
    validatePatientAcquisition(dto);
    const existing = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Patient not found");
    if (dto.homeBranchId !== undefined) {
      await this.assertHomeBranchInScope(tenantId, user, dto.homeBranchId ?? null);
    }
    if (dto.homeBranchId) {
      const branch = await this.prisma.clinic.findFirst({
        where: { id: dto.homeBranchId, tenantId },
      });
      if (!branch) throw new BadRequestException("Invalid homeBranchId");
    }
    const nextNational = dto.nationalId !== undefined ? (dto.nationalId?.trim() || null) : undefined;
    if (nextNational) {
      const clash = await this.prisma.patient.findFirst({
        where: { tenantId, nationalId: nextNational, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("nationalId already in use");
    }
    const data: Prisma.PatientUpdateInput = {};
    if (dto.firstNameEn !== undefined) data.firstNameEn = dto.firstNameEn;
    if (dto.lastNameEn !== undefined) data.lastNameEn = dto.lastNameEn;
    if (dto.firstNameAr !== undefined) data.firstNameAr = dto.firstNameAr ?? null;
    if (dto.lastNameAr !== undefined) data.lastNameAr = dto.lastNameAr ?? null;
    if (dto.dob !== undefined) data.dob = new Date(dto.dob);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.nationalId !== undefined) data.nationalId = nextNational ?? null;
    if (dto.homeBranchId !== undefined) data.homeBranch = dto.homeBranchId ? { connect: { id: dto.homeBranchId } } : { disconnect: true };
    if (dto.acquisitionChannel !== undefined) {
      Object.assign(data, patientAcquisitionUpdateData({
        acquisitionChannel: dto.acquisitionChannel,
        acquisitionReferralName: dto.acquisitionReferralName,
        acquisitionOtherDetail: dto.acquisitionOtherDetail,
      }));
    } else {
      if (dto.acquisitionReferralName !== undefined) {
        data.acquisitionReferralName = dto.acquisitionReferralName?.trim() || null;
      }
      if (dto.acquisitionOtherDetail !== undefined) {
        data.acquisitionOtherDetail = dto.acquisitionOtherDetail?.trim() || null;
      }
    }

    const row = await this.prisma.patient.update({
      where: { id },
      data,
      include: { homeBranch: { select: { nameEn: true } } },
    });
    return this.map(row);
  }

  async attachNationalIdDocument(
    tenantId: string,
    patientId: string,
    user: JwtUser,
    file?: PatientDocFile
  ): Promise<PatientDto> {
    await this.getById(tenantId, patientId, user);
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_PATIENT_DOC_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_PATIENT_DOC_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);
    const docId = randomUUID();
    const base = path.basename(file.originalname || "national-id").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "national-id";
    const relativePath = `${tenantId}/${patientId}/${docId}-${base}`;
    await this.uploads.put("patients", relativePath, file.buffer, mime);
    const row = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        nationalIdDocRelativePath: relativePath,
        nationalIdDocOriginalName: file.originalname || base,
        nationalIdDocMimeType: mime,
      },
      include: { homeBranch: { select: { nameEn: true } } },
    });
    return this.map(row);
  }

  async getNationalIdDocumentMeta(
    tenantId: string,
    patientId: string,
    user: JwtUser
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    await this.getById(tenantId, patientId, user);
    const row = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!row?.nationalIdDocRelativePath || !row.nationalIdDocOriginalName || !row.nationalIdDocMimeType) {
      throw new NotFoundException("No national ID document attached");
    }
    await this.uploads.assertExists("patients", row.nationalIdDocRelativePath);
    return {
      storageKey: row.nationalIdDocRelativePath,
      mimeType: row.nationalIdDocMimeType,
      originalFileName: row.nationalIdDocOriginalName,
    };
  }

  openNationalIdDocumentReadStream(storageKey: string) {
    return this.uploads.getReadStream("patients", storageKey);
  }

  async attachDocument(
    tenantId: string,
    patientId: string,
    user: JwtUser,
    description: string,
    file?: PatientDocFile,
  ): Promise<PatientDocumentDto> {
    await this.getById(tenantId, patientId, user);
    const desc = description?.trim();
    if (!desc) throw new BadRequestException("Document description is required");
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_PATIENT_DOC_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_PATIENT_DOC_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const docId = randomUUID();
    const base = path.basename(file.originalname || "document").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "document";
    const relativePath = `${tenantId}/${patientId}/docs/${docId}-${base}`;
    await this.uploads.put("patients", relativePath, file.buffer, mime);

    const row = await this.prisma.patientDocument.create({
      data: {
        id: docId,
        tenantId,
        patientId,
        description: desc,
        originalFileName: file.originalname || base,
        mimeType: mime,
        sizeBytes: file.size,
        relativePath,
      },
    });
    return this.mapDoc(row);
  }

  async getDocumentMeta(
    tenantId: string,
    patientId: string,
    documentId: string,
    user: JwtUser,
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    await this.getById(tenantId, patientId, user);
    const doc = await this.prisma.patientDocument.findFirst({
      where: { id: documentId, patientId, tenantId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.uploads.assertExists("patients", doc.relativePath);
    return {
      storageKey: doc.relativePath,
      mimeType: doc.mimeType,
      originalFileName: doc.originalFileName,
    };
  }

  openDocumentReadStream(storageKey: string) {
    return this.uploads.getReadStream("patients", storageKey);
  }
}
