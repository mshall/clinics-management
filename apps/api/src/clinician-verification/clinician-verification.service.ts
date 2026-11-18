import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { ClinicalSpecialty, Prisma, UserRole, VerificationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "../common/effective-roles";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { decryptClinicianNationalId, encryptClinicianNationalId } from "./field-crypto";
import { tenantHasVerifiedPhysician, KIOREX_VERIFICATION_REQUIRED } from "./kiorex-marketplace-gate";
import {
  parseVerificationDocuments,
  VERIFICATION_DOCUMENT_KINDS,
  type VerificationDocumentKind,
  type VerificationDocumentRef,
} from "./verification-documents";
import type {
  ClinicianVerificationDto,
  PlatformVerificationListItemDto,
  PlatformVerificationReviewConfigDto,
  PlatformVerificationReviewMetricsDto,
} from "./dto/clinician-verification.dto";
import {
  VERIFICATION_REJECT_REASON_CODES,
  VERIFICATION_REJECT_REASON_LABELS,
  VERIFICATION_REVIEW_CHECKLIST_KEYS,
  VERIFICATION_REVIEW_SLA_HOURS,
  composeRejectReason,
  missingReviewChecklistKeys,
  type VerificationRejectReasonCode,
} from "./verification-review-policy";
import { medianReviewDurationMs, slaBreached, waitingDurationMs } from "./verification-review-metrics";

const MAX_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type UploadFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

function isPhysicianUser(user: JwtUser): boolean {
  return hasRole(user, UserRole.PHYSICIAN);
}

function mapDto(row: {
  id: string;
  userId: string;
  tenantId: string;
  syndicateNumber: string | null;
  specialty: ClinicalSpecialty | null;
  titleEn: string | null;
  titleAr: string | null;
  nationalIdEnc: string | null;
  documentKeys: unknown;
  status: VerificationStatus;
  rejectReason: string | null;
  reviewedAt: Date | null;
  verifiedSpecialty: ClinicalSpecialty | null;
  updatedAt: Date;
}): ClinicianVerificationDto {
  const docs = parseVerificationDocuments(row.documentKeys);
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    syndicateNumber: row.syndicateNumber,
    specialty: row.specialty,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    hasNationalId: Boolean(row.nationalIdEnc?.trim()),
    documents: docs.map((d) => ({
      kind: d.kind,
      originalFileName: d.originalFileName,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
    })),
    status: row.status,
    rejectReason: row.rejectReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    verifiedSpecialty: row.verifiedSpecialty,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ClinicianVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly audit: AuditService,
  ) {}

  private assertPhysician(user: JwtUser) {
    if (!user.tenantId) throw new ForbiddenException("Tenant required");
    if (!isPhysicianUser(user)) {
      throw new ForbiddenException("Physician role required");
    }
  }

  async assertTenantCanEnableKiorexMarketplace(tenantId: string): Promise<void> {
    const rows = await this.prisma.clinicianVerification.findMany({
      where: { tenantId },
      select: {
        status: true,
        user: { select: { role: true, additionalRoles: true } },
      },
    });
    if (!tenantHasVerifiedPhysician(rows)) {
      throw new ForbiddenException({
        code: KIOREX_VERIFICATION_REQUIRED,
        message: "At least one verified physician is required before Kiorex marketplace listing",
      });
    }
  }

  async getOrCreateForUser(tenantId: string, userId: string): Promise<ClinicianVerificationDto> {
    let row = await this.prisma.clinicianVerification.findUnique({ where: { userId } });
    if (!row) {
      row = await this.prisma.clinicianVerification.create({
        data: { userId, tenantId, documentKeys: [] },
      });
    }
    return mapDto(row);
  }

  async getMine(user: JwtUser): Promise<ClinicianVerificationDto> {
    this.assertPhysician(user);
    const tenantId = user.tenantId!;
    return this.getOrCreateForUser(tenantId, user.userId);
  }

  async upsertMine(
    user: JwtUser,
    body: {
      syndicateNumber?: string;
      specialty?: ClinicalSpecialty;
      titleEn?: string;
      titleAr?: string;
      nationalId?: string;
      submit?: boolean;
    },
  ): Promise<ClinicianVerificationDto> {
    this.assertPhysician(user);
    const tenantId = user.tenantId!;
    const existing = await this.getOrCreateForUser(tenantId, user.userId);
    if (existing.status === VerificationStatus.PENDING) {
      throw new BadRequestException("Verification is pending review");
    }

    const data: Prisma.ClinicianVerificationUpdateInput = {};
    if (body.syndicateNumber !== undefined) data.syndicateNumber = body.syndicateNumber.trim() || null;
    if (body.titleEn !== undefined) data.titleEn = body.titleEn.trim() || null;
    if (body.titleAr !== undefined) data.titleAr = body.titleAr.trim() || null;
    if (body.nationalId !== undefined) {
      const enc = body.nationalId.trim() ? encryptClinicianNationalId(body.nationalId) : null;
      data.nationalIdEnc = enc;
    }
    if (body.specialty !== undefined) {
      data.specialty = body.specialty;
      if (
        existing.status === VerificationStatus.VERIFIED &&
        existing.verifiedSpecialty &&
        body.specialty !== existing.verifiedSpecialty
      ) {
        data.status = VerificationStatus.PENDING;
        data.rejectReason = null;
        data.reviewedAt = null;
        data.reviewer = { disconnect: true };
        data.pendingAt = new Date();
        data.reviewDurationMs = null;
        data.rejectReasonCode = null;
      }
    }

    if (body.submit) {
      const current = await this.prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: user.userId } });
      const docs = parseVerificationDocuments(current.documentKeys);
      if (!current.syndicateNumber?.trim() && !data.syndicateNumber) {
        throw new BadRequestException("Syndicate number is required");
      }
      if (!current.specialty && !data.specialty) {
        throw new BadRequestException("Specialty is required");
      }
      const requiredKinds: VerificationDocumentKind[] = ["SYNDICATE_CARD", "SPECIALTY_CERTIFICATE"];
      for (const kind of requiredKinds) {
        if (!docs.some((d) => d.kind === kind)) {
          throw new BadRequestException(`Missing document: ${kind}`);
        }
      }
      data.status = VerificationStatus.PENDING;
      data.rejectReason = null;
      data.pendingAt = new Date();
      data.reviewDurationMs = null;
      data.rejectReasonCode = null;
    }

    const row = await this.prisma.clinicianVerification.update({
      where: { userId: user.userId },
      data,
    });

    if (body.submit) {
      await this.audit.recordEvent({
        tenantId,
        actorId: user.userId,
        clinicId: null,
        action: "clinician.verification.submitted",
        resource: "ClinicianVerification",
        resourceId: row.id,
        metadata: { status: VerificationStatus.PENDING },
      });
    }

    return mapDto(row);
  }

  async attachDocument(user: JwtUser, kind: VerificationDocumentKind, file?: UploadFile): Promise<ClinicianVerificationDto> {
    this.assertPhysician(user);
    if (!VERIFICATION_DOCUMENT_KINDS.includes(kind)) throw new BadRequestException("Invalid document kind");
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_DOC_BYTES) throw new BadRequestException("File too large (max 15MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const tenantId = user.tenantId!;
    await this.getOrCreateForUser(tenantId, user.userId);
    const row = await this.prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: user.userId } });
    if (row.status === VerificationStatus.PENDING) {
      throw new BadRequestException("Cannot upload while pending review");
    }

    const docId = randomUUID();
    const base = path.basename(file.originalname || "doc").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "doc";
    const relativePath = `${tenantId}/${user.userId}/${docId}-${base}`;
    await this.uploads.put("clinicians", relativePath, file.buffer, mime);

    const docs = parseVerificationDocuments(row.documentKeys).filter((d) => d.kind !== kind);
    const next: VerificationDocumentRef = {
      kind,
      relativePath,
      originalFileName: file.originalname || base,
      mimeType: mime,
      uploadedAt: new Date().toISOString(),
    };
    docs.push(next);

    const updated = await this.prisma.clinicianVerification.update({
      where: { userId: user.userId },
      data: { documentKeys: docs as unknown as Prisma.InputJsonValue },
    });
    return mapDto(updated);
  }

  async streamDocument(
    viewer: JwtUser,
    userId: string,
    kind: VerificationDocumentKind,
    options?: { platformReview?: boolean },
  ): Promise<StreamableFile> {
    const row = await this.prisma.clinicianVerification.findUnique({
      where: { userId },
      include: { user: { select: { tenantId: true } } },
    });
    if (!row) throw new NotFoundException("Verification not found");
    const docs = parseVerificationDocuments(row.documentKeys);
    const doc = docs.find((d) => d.kind === kind);
    if (!doc) throw new NotFoundException("Document not found");

    const platform = isPlatformSuperAdmin(viewer);
    const sameUser = viewer.userId === userId;
    const sameTenant = viewer.tenantId && viewer.tenantId === row.tenantId;
    if (!platform && !sameUser && !sameTenant) {
      throw new ForbiddenException("Access denied");
    }
    if (options?.platformReview && !platform) throw new ForbiddenException("Platform review only");

    const stream = await this.uploads.getReadStream("clinicians", doc.relativePath);
    await this.audit.recordEvent({
      tenantId: row.tenantId,
      actorId: viewer.userId,
      clinicId: null,
      action: "clinician.verification.document_viewed",
      resource: "ClinicianVerification",
      resourceId: row.id,
      metadata: { kind, platformReview: Boolean(options?.platformReview) },
    });
    return new StreamableFile(stream, { type: doc.mimeType, disposition: `inline; filename="${doc.originalFileName}"` });
  }

  async getPlatformReviewConfig(user: JwtUser): Promise<PlatformVerificationReviewConfigDto> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    return {
      slaTargetHours: VERIFICATION_REVIEW_SLA_HOURS,
      checklistKeys: [...VERIFICATION_REVIEW_CHECKLIST_KEYS],
      rejectTemplates: VERIFICATION_REJECT_REASON_CODES.map((code) => ({
        code,
        labelEn: VERIFICATION_REJECT_REASON_LABELS[code].en,
        labelAr: VERIFICATION_REJECT_REASON_LABELS[code].ar,
      })),
    };
  }

  async getPlatformReviewMetrics(user: JwtUser): Promise<PlatformVerificationReviewMetricsDto> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [pendingCount, reviewed] = await Promise.all([
      this.prisma.clinicianVerification.count({ where: { status: VerificationStatus.PENDING } }),
      this.prisma.clinicianVerification.findMany({
        where: {
          reviewedAt: { gte: since },
          reviewDurationMs: { not: null },
        },
        select: { reviewDurationMs: true },
      }),
    ]);
    const durations = reviewed.map((r) => r.reviewDurationMs!).filter((n) => n != null);
    return {
      pendingCount,
      medianReviewMs: medianReviewDurationMs(durations),
      reviewsCounted: durations.length,
      slaTargetHours: VERIFICATION_REVIEW_SLA_HOURS,
    };
  }

  async listForPlatform(
    user: JwtUser,
    query: { status?: VerificationStatus; page?: number; pageSize?: number },
  ): Promise<{ items: PlatformVerificationListItemDto[]; total: number; page: number; pageSize: number }> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 20));
    const where: Prisma.ClinicianVerificationWhereInput = {};
    if (query.status) where.status = query.status;

    const orderBy: Prisma.ClinicianVerificationOrderByWithRelationInput[] =
      query.status === VerificationStatus.PENDING
        ? [{ pendingAt: "asc" }, { updatedAt: "asc" }]
        : [{ reviewedAt: "desc" }, { updatedAt: "desc" }];

    const [total, rows] = await Promise.all([
      this.prisma.clinicianVerification.count({ where }),
      this.prisma.clinicianVerification.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { displayName: true, email: true } },
          tenant: { select: { name: true } },
        },
      }),
    ]);

  const mapPlatformRow = (
    r: (typeof rows)[number],
  ): PlatformVerificationListItemDto => {
    const pendingAt = r.pendingAt ?? null;
    const waitingMs =
      r.status === VerificationStatus.PENDING && pendingAt
        ? waitingDurationMs(pendingAt)
        : null;
    const breached =
      waitingMs != null && pendingAt ? slaBreached(pendingAt, VERIFICATION_REVIEW_SLA_HOURS) : null;
    return {
      ...mapDto(r),
      clinicianName: r.user.displayName,
      clinicianEmail: r.user.email,
      tenantName: r.tenant.name,
      pendingAt: pendingAt?.toISOString() ?? null,
      waitingMs,
      slaBreached: breached,
    };
  };

    return {
      total,
      page,
      pageSize,
      items: rows.map(mapPlatformRow),
    };
  }

  async platformDecision(
    user: JwtUser,
    id: string,
    body: {
      decision: "approve" | "reject";
      rejectReason?: string;
      rejectReasonCode?: string;
      checklist?: string[];
    },
  ): Promise<ClinicianVerificationDto> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    const row = await this.prisma.clinicianVerification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Verification not found");
    if (row.status !== VerificationStatus.PENDING) {
      throw new BadRequestException("Only pending verifications can be decided");
    }

    const reviewedAt = new Date();
    const queueStart = row.pendingAt ?? row.updatedAt;
    const reviewDurationMs = Math.max(0, reviewedAt.getTime() - queueStart.getTime());
    const checklist = body.checklist ?? [];

    if (body.decision === "reject") {
      const codeRaw = body.rejectReasonCode?.trim();
      let reason = body.rejectReason?.trim() ?? "";
      let rejectReasonCode: string | null = null;
      if (codeRaw) {
        if (!VERIFICATION_REJECT_REASON_CODES.includes(codeRaw as VerificationRejectReasonCode)) {
          throw new BadRequestException("Invalid reject reason code");
        }
        const code = codeRaw as VerificationRejectReasonCode;
        rejectReasonCode = code;
        reason = composeRejectReason(code, body.rejectReason);
      }
      if (!reason) throw new BadRequestException("Reject reason required");
      const updated = await this.prisma.clinicianVerification.update({
        where: { id },
        data: {
          status: VerificationStatus.REJECTED,
          rejectReason: reason,
          rejectReasonCode,
          reviewedAt,
          reviewDurationMs,
          lastReviewChecklist: checklist as Prisma.InputJsonValue,
          reviewer: { connect: { id: user.userId } },
        },
      });
      await this.audit.recordEvent({
        tenantId: row.tenantId,
        actorId: user.userId,
        clinicId: null,
        action: "clinician.verification.rejected",
        resource: "ClinicianVerification",
        resourceId: row.id,
        metadata: { reason, rejectReasonCode, checklist, reviewDurationMs },
      });
      return mapDto(updated);
    }

    const missingChecklist = missingReviewChecklistKeys(checklist);
    if (missingChecklist.length > 0) {
      throw new BadRequestException(`Complete review checklist: ${missingChecklist.join(", ")}`);
    }

    const updated = await this.prisma.clinicianVerification.update({
      where: { id },
      data: {
        status: VerificationStatus.VERIFIED,
        rejectReason: null,
        rejectReasonCode: null,
        reviewedAt,
        reviewDurationMs,
        lastReviewChecklist: checklist as Prisma.InputJsonValue,
        verifiedSpecialty: row.specialty,
        reviewer: { connect: { id: user.userId } },
      },
    });
    await this.audit.recordEvent({
      tenantId: row.tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "clinician.verification.approved",
      resource: "ClinicianVerification",
      resourceId: row.id,
      metadata: { checklist, reviewDurationMs },
    });
    return mapDto(updated);
  }

  async resolveUserIdForVerificationId(verificationId: string): Promise<string> {
    const row = await this.prisma.clinicianVerification.findUnique({ where: { id: verificationId }, select: { userId: true } });
    if (!row) throw new NotFoundException("Verification not found");
    return row.userId;
  }

  async countVerifiedPhysicians(tenantId: string): Promise<number> {
    return this.prisma.clinicianVerification.count({
      where: {
        tenantId,
        status: VerificationStatus.VERIFIED,
        user: {
          OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }],
        },
      },
    });
  }

  /** Platform-only: decrypt national ID for review. */
  async revealNationalIdForPlatform(user: JwtUser, verificationId: string): Promise<{ nationalId: string | null }> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    const row = await this.prisma.clinicianVerification.findUnique({ where: { id: verificationId } });
    if (!row) throw new NotFoundException("Verification not found");
    const nationalId = decryptClinicianNationalId(row.nationalIdEnc);
    await this.audit.recordEvent({
      tenantId: row.tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "clinician.verification.national_id_revealed",
      resource: "ClinicianVerification",
      resourceId: row.id,
      metadata: {},
    });
    return { nationalId };
  }
}