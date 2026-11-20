import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  StreamableFile,
} from "@nestjs/common";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { ClinicalSpecialty, Prisma, Profession, UserRole, VerificationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "../common/effective-roles";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import {
  EG_PROFESSION_PACK,
  checklistKeysFor,
  requiredDocumentsFor,
  resolveProfessionPack,
  type ProfessionPack,
  type ProfessionVerificationRule,
} from "../scope-of-practice/profession-pack";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import {
  computeNextReverifyAt,
  registrationNumberValid,
  verificationBadge,
  type ReverifyReason,
} from "./profession-verification";
import { applyReverification } from "./reverify";
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
  ProfessionalRegistrationDto,
  PlatformVerificationReviewConfigDto,
  PlatformVerificationReviewMetricsDto,
} from "./dto/clinician-verification.dto";
import {
  VERIFICATION_REJECT_REASON_CODES,
  VERIFICATION_REJECT_REASON_LABELS,
  ALL_REVIEW_CHECKLIST_KEYS,
  REVIEW_CHECKLIST_LABELS,
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

type VerificationRow = {
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
  profession?: Profession | null;
  verifiedProfession?: Profession | null;
  isSolo?: boolean;
  nextReverifyAt?: Date | null;
  reverifyReason?: string | null;
  verifiedAt?: Date | null;
};

type RegistrationRow = {
  registerCode: string;
  registrationNumber: string;
  expiresAt: Date | null;
  status: VerificationStatus;
  verifiedAt: Date | null;
};

type DtoContext = {
  pack?: ProfessionPack;
  /** The clinician's current effective profession (User.profession with the legacy mapping). */
  currentProfession?: Profession | null;
  registrations?: RegistrationRow[];
};

function ruleFor(pack: ProfessionPack, profession: Profession | null): ProfessionVerificationRule | null {
  return profession ? pack.verification[profession] ?? null : null;
}

function mapDto(row: VerificationRow, ctx: DtoContext = {}): ClinicianVerificationDto {
  const docs = parseVerificationDocuments(row.documentKeys);
  const pack = ctx.pack ?? EG_PROFESSION_PACK;
  const profession = ctx.currentProfession ?? row.profession ?? null;
  const rule = ruleFor(pack, profession);
  const solo = Boolean(row.isSolo);
  const regs: ProfessionalRegistrationDto[] = (ctx.registrations ?? []).map((r) => {
    const reg = rule?.registers.find((x) => x.code === r.registerCode);
    return {
      registerCode: r.registerCode,
      labelEn: reg?.labelEn ?? r.registerCode,
      labelAr: reg?.labelAr ?? r.registerCode,
      registrationNumber: r.registrationNumber,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      status: r.status,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
    };
  });
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
    profession,
    verifiedProfession: row.verifiedProfession ?? null,
    isSolo: solo,
    requiredDocuments: rule ? requiredDocumentsFor(rule, solo) : [],
    requiredRegisters: (rule?.registers ?? []).map((r) => ({
      code: r.code,
      labelEn: r.labelEn,
      labelAr: r.labelAr,
      required: r.required,
      hasExpiry: Boolean(r.hasExpiry),
      isSyndicate: Boolean(r.isSyndicate),
    })),
    reviewChecklist: rule ? checklistKeysFor(rule, solo) : [],
    registrations: regs,
    badge: verificationBadge(pack, profession, row.status),
    nextReverifyAt: row.nextReverifyAt?.toISOString() ?? null,
    reverifyReason: row.reverifyReason ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ClinicianVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly audit: AuditService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /** Market pack (profession verification rules) for a tenant. */
  async packForTenant(tenantId: string): Promise<ProfessionPack> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { market: { select: { code: true, clinicalConfig: true } } },
    });
    return resolveProfessionPack(t?.market);
  }

  /** Verifiable clinicians only: physician / dentist / physiotherapist / nurse (never unlicensed assistants). */
  private async assertClinician(user: JwtUser): Promise<{ profession: Profession; pack: ProfessionPack; tenantId: string }> {
    if (!user.tenantId) throw new ForbiddenException("Tenant required");
    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { profession: true, role: true, additionalRoles: true, displayName: true },
    });
    const profession = row ? effectiveProfession(row) : null;
    const pack = await this.packForTenant(user.tenantId);
    if (!profession || !pack.verification[profession]?.verifiable) {
      throw new ForbiddenException("A licensed clinician profile is required (physician, dentist, physiotherapist or nurse)");
    }
    return { profession, pack, tenantId: user.tenantId };
  }

  private async loadCtx(row: { userId: string; tenantId: string }): Promise<DtoContext> {
    const [u, pack, registrations] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: row.userId }, select: { profession: true, role: true, additionalRoles: true } }),
      this.packForTenant(row.tenantId),
      this.prisma.professionalRegistration.findMany({ where: { userId: row.userId }, orderBy: { registerCode: "asc" } }),
    ]);
    return { pack, currentProfession: u ? effectiveProfession(u) : null, registrations };
  }

  private async dtoFor(row: VerificationRow): Promise<ClinicianVerificationDto> {
    return mapDto(row, await this.loadCtx(row));
  }

  async assertTenantCanEnableKiorexMarketplace(tenantId: string): Promise<void> {
    const rows = await this.prisma.clinicianVerification.findMany({
      where: { tenantId },
      select: {
        status: true,
        verifiedProfession: true,
        user: { select: { role: true, additionalRoles: true, profession: true } },
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
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { profession: true, role: true, additionalRoles: true } });
      row = await this.prisma.clinicianVerification.create({
        data: { userId, tenantId, documentKeys: [], profession: u ? effectiveProfession(u) : null },
      });
    }
    return this.dtoFor(row);
  }

  async getMine(user: JwtUser): Promise<ClinicianVerificationDto> {
    await this.assertClinician(user);
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
      registrations?: { registerCode: string; registrationNumber: string; expiresAt?: string }[];
      solo?: boolean;
    },
  ): Promise<ClinicianVerificationDto> {
    const { profession, pack, tenantId } = await this.assertClinician(user);
    const rule = pack.verification[profession];
    const existing = await this.getOrCreateForUser(tenantId, user.userId);
    if (existing.status === VerificationStatus.PENDING) {
      throw new BadRequestException("Verification is pending review");
    }
    // PRVER04 / ADR-032: the Nurse edition decides who is "solo": a nurse in a SOLO organization always gets the extra evidence checklist (ID selfie + criminal-record certificate).
    const org = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { edition: true, nurseTenantKind: true } });
    if (org?.edition === "NURSE" && org.nurseTenantKind === "SOLO" && profession === Profession.NURSE) body = { ...body, solo: true };

    const data: Prisma.ClinicianVerificationUpdateInput = { profession };
    if (body.syndicateNumber !== undefined) data.syndicateNumber = body.syndicateNumber.trim() || null;
    if (body.titleEn !== undefined) data.titleEn = body.titleEn.trim() || null;
    if (body.titleAr !== undefined) data.titleAr = body.titleAr.trim() || null;
    if (body.solo !== undefined) data.isSolo = Boolean(body.solo);
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
        data.reverifyReason = "SPECIALTY_CHANGED" satisfies ReverifyReason;
      }
    }

    // PRVER01 — registrations per the profession's register rules (syndicate number mirrors the legacy column).
    const regInputs = new Map<string, { registrationNumber: string; expiresAt: Date | null }>();
    for (const r of body.registrations ?? []) {
      const reg = rule.registers.find((x) => x.code === r.registerCode);
      if (!reg) throw new BadRequestException(`Unknown register for ${profession}: ${r.registerCode}`);
      const num = r.registrationNumber?.trim() ?? "";
      if (!registrationNumberValid(reg, num)) throw new BadRequestException(`Invalid registration number for ${reg.code}`);
      let expiresAt: Date | null = null;
      if (r.expiresAt) {
        expiresAt = new Date(r.expiresAt);
        if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException(`Invalid expiry date for ${reg.code}`);
      }
      regInputs.set(reg.code, { registrationNumber: num, expiresAt });
    }
    const syndicateReg = rule.registers.find((r) => r.isSyndicate);
    if (syndicateReg) {
      const fromReg = regInputs.get(syndicateReg.code)?.registrationNumber;
      if (fromReg) data.syndicateNumber = fromReg;
      else if (body.syndicateNumber?.trim()) {
        const num = body.syndicateNumber.trim();
        if (!registrationNumberValid(syndicateReg, num)) throw new BadRequestException(`Invalid registration number for ${syndicateReg.code}`);
        regInputs.set(syndicateReg.code, { registrationNumber: num, expiresAt: null });
      }
    }

    if (body.submit) {
      const current = await this.prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: user.userId } });
      const docs = parseVerificationDocuments(current.documentKeys);
      const solo = body.solo !== undefined ? Boolean(body.solo) : current.isSolo;
      if (!current.syndicateNumber?.trim() && !data.syndicateNumber) {
        throw new BadRequestException("Syndicate number is required");
      }
      const requiredKinds = requiredDocumentsFor(rule, solo);
      if (requiredKinds.includes("SPECIALTY_CERTIFICATE") && !current.specialty && !data.specialty) {
        throw new BadRequestException("Specialty is required");
      }
      for (const kind of requiredKinds) {
        if (!docs.some((d) => d.kind === kind)) {
          throw new BadRequestException(`Missing document: ${kind}`);
        }
      }
      const stored = await this.prisma.professionalRegistration.findMany({ where: { userId: user.userId } });
      const now = Date.now();
      for (const reg of rule.registers) {
        if (reg.isSyndicate) continue; // covered by the syndicate-number check above
        const provided = regInputs.get(reg.code) ?? stored.find((x) => x.registerCode === reg.code);
        if (!provided) {
          if (reg.required) throw new BadRequestException(`Missing registration: ${reg.code}`);
          continue;
        }
        const exp = "expiresAt" in provided ? provided.expiresAt : null;
        if (reg.required && reg.hasExpiry && !exp) throw new BadRequestException(`Expiry date required for ${reg.code}`);
        if (exp && exp.getTime() <= now) throw new BadRequestException(`Licence already expired: ${reg.code}`);
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

    for (const [registerCode, v] of regInputs) {
      await this.prisma.professionalRegistration.upsert({
        where: { userId_registerCode: { userId: user.userId, registerCode } },
        create: {
          tenantId,
          userId: user.userId,
          verificationId: row.id,
          profession,
          registerCode,
          registrationNumber: v.registrationNumber,
          expiresAt: v.expiresAt,
          status: body.submit ? VerificationStatus.PENDING : VerificationStatus.UNVERIFIED,
        },
        update: {
          verificationId: row.id,
          profession,
          registrationNumber: v.registrationNumber,
          ...(v.expiresAt !== null || body.registrations?.some((r) => r.registerCode === registerCode) ? { expiresAt: v.expiresAt } : {}),
          status: body.submit ? VerificationStatus.PENDING : VerificationStatus.UNVERIFIED,
          verifiedAt: null,
        },
      });
    }
    if (body.submit) {
      await this.prisma.professionalRegistration.updateMany({
        where: { userId: user.userId },
        data: { status: VerificationStatus.PENDING, verifiedAt: null },
      });
      await this.audit.recordEvent({
        tenantId,
        actorId: user.userId,
        clinicId: null,
        action: "clinician.verification.submitted",
        resource: "ClinicianVerification",
        resourceId: row.id,
        metadata: { status: VerificationStatus.PENDING, profession },
      });
    }

    return this.dtoFor(row);
  }

  async attachDocument(user: JwtUser, kind: VerificationDocumentKind, file?: UploadFile): Promise<ClinicianVerificationDto> {
    await this.assertClinician(user);
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
    return this.dtoFor(updated);
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
      checklistKeys: [...ALL_REVIEW_CHECKLIST_KEYS],
      checklistByProfession: Object.fromEntries(
        (Object.keys(EG_PROFESSION_PACK.verification) as Profession[]).map((p) => [
          p,
          {
            base: checklistKeysFor(EG_PROFESSION_PACK.verification[p], false),
            solo: checklistKeysFor(EG_PROFESSION_PACK.verification[p], true),
          },
        ]),
      ),
      checklistLabels: REVIEW_CHECKLIST_LABELS,
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
    query: { status?: VerificationStatus; profession?: Profession; page?: number; pageSize?: number },
  ): Promise<{ items: PlatformVerificationListItemDto[]; total: number; page: number; pageSize: number }> {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 20));
    const where: Prisma.ClinicianVerificationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.profession) where.profession = query.profession;

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

    const userIds = rows.map((r) => r.userId);
    const [regRows, userRows] = await Promise.all([
      this.prisma.professionalRegistration.findMany({ where: { userId: { in: userIds } }, orderBy: { registerCode: "asc" } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, profession: true, role: true, additionalRoles: true } }),
    ]);
    const packByTenant = new Map<string, ProfessionPack>();
    for (const r of rows) {
      if (!packByTenant.has(r.tenantId)) packByTenant.set(r.tenantId, await this.packForTenant(r.tenantId));
    }
    const profByUser = new Map(userRows.map((u) => [u.id, effectiveProfession(u)]));

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
      ...mapDto(r, {
        pack: packByTenant.get(r.tenantId),
        currentProfession: profByUser.get(r.userId) ?? null,
        registrations: regRows.filter((g) => g.userId === r.userId),
      }),
      clinicianName: r.user.displayName,
      clinicianEmail: r.user.email,
      clinicianCurrentProfession: profByUser.get(r.userId) ?? null,
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

    const ctx = await this.loadCtx(row);
    const pack = ctx.pack ?? EG_PROFESSION_PACK;
    const profession = row.profession ?? ctx.currentProfession ?? null;
    const rule = ruleFor(pack, profession);

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
      await this.prisma.professionalRegistration.updateMany({
        where: { userId: row.userId },
        data: { status: VerificationStatus.REJECTED, verifiedAt: null },
      });
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
      return this.dtoFor(updated);
    }

    if (!rule || !rule.verifiable || !profession) {
      throw new BadRequestException("This profession cannot be verified (unlicensed assistants are never verified or listed)");
    }
    if (ctx.currentProfession && ctx.currentProfession !== profession) {
      throw new BadRequestException("Profession changed since submission; the clinician must re-submit");
    }
    const missingChecklist = missingReviewChecklistKeys(checklist, checklistKeysFor(rule, row.isSolo));
    if (missingChecklist.length > 0) {
      throw new BadRequestException(`Complete review checklist: ${missingChecklist.join(", ")}`);
    }

    const subject = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId }, select: { displayName: true } });
    const regs = await this.prisma.professionalRegistration.findMany({ where: { userId: row.userId } });
    const nextReverifyAt = computeNextReverifyAt(pack, reviewedAt, regs.map((r) => r.expiresAt));
    await this.prisma.professionalRegistration.updateMany({
      where: { userId: row.userId },
      data: { status: VerificationStatus.VERIFIED, verifiedAt: reviewedAt },
    });
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
        verifiedProfession: profession,
        profession,
        verifiedName: subject.displayName,
        verifiedAt: reviewedAt,
        nextReverifyAt,
        expiryReminderStage: 0,
        reverifyReason: null,
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
      metadata: { checklist, reviewDurationMs, profession, nextReverifyAt: nextReverifyAt.toISOString() },
    });
    return this.dtoFor(updated);
  }

  /**
   * PRVER03 / hazard H11 — send a verified record back for review (name, profession or specialty changed, licence
   * expired). VERIFIED -> PENDING (or EXPIRED for lapsed licences); other states keep their status. Idempotent.
   */
  async triggerReverification(
    userId: string,
    reason: ReverifyReason,
    actorId: string | null,
  ): Promise<{ changed: boolean }> {
    const row = await applyReverification(this.prisma, userId, reason);
    if (!row) return { changed: false };
    const expired = row.expired;
    await this.audit.recordEvent({
      tenantId: row.tenantId,
      actorId,
      clinicId: null,
      action: expired ? "clinician.verification.expired" : "clinician.verification.reverify_required",
      resource: "ClinicianVerification",
      resourceId: row.id,
      metadata: { reason },
    });
    return { changed: true };
  }

  /**
   * PRSOP01 — set a clinician's profession. Changing it forces re-verification (PRVER03). ASSISTANT (PRSOP03) needs a
   * named supervising licensed clinician of the same organisation and is never verified or listed.
   */
  async setProfession(
    actor: JwtUser,
    targetUserId: string,
    profession: Profession,
    supervisorUserId?: string | null,
  ): Promise<{ userId: string; profession: Profession; supervisorUserId: string | null; reverification: boolean }> {
    if (!actor.tenantId) throw new ForbiddenException("Tenant required");
    const allowed = actor.isTenantOwner || hasRole(actor, UserRole.CLINIC_ADMIN) || hasRole(actor, UserRole.GROUP_ADMIN) || hasRole(actor, UserRole.BRANCH_MANAGER);
    if (!allowed) throw new ForbiddenException("Only organisation admins can change a clinician's profession");
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId: actor.tenantId, deletedAt: null },
      select: { id: true, profession: true, role: true, additionalRoles: true, tenantId: true },
    });
    if (!target) throw new NotFoundException("User not found");
    const pack = await this.packForTenant(actor.tenantId);
    const previous = effectiveProfession(target);
    // New physio sign-ups are switchable (clinic.profession.physiotherapy OFF: existing physios keep working; this only blocks NEW ones).
    if (profession === Profession.PHYSIOTHERAPIST && previous !== Profession.PHYSIOTHERAPIST && this.flags) {
      await requireFeature(this.flags, actor.tenantId, "clinic.profession.physiotherapy");
    }

    let supervisor: string | null = null;
    if (profession === Profession.ASSISTANT) {
      if (!supervisorUserId) throw new BadRequestException("An assistant needs a named supervising clinician (PRSOP03)");
      if (supervisorUserId === targetUserId) throw new BadRequestException("An assistant cannot supervise themselves");
      const sup = await this.prisma.user.findFirst({
        where: { id: supervisorUserId, tenantId: actor.tenantId, deletedAt: null },
        select: { profession: true, role: true, additionalRoles: true },
      });
      const supProfession = sup ? effectiveProfession(sup) : null;
      if (!sup || !supProfession || !pack.verification[supProfession]?.verifiable) {
        throw new BadRequestException("The supervisor must be a licensed clinician of this organisation");
      }
      supervisor = supervisorUserId;
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { profession, supervisorUserId: supervisor },
    });

    let reverification = false;
    const ver = await this.prisma.clinicianVerification.findUnique({ where: { userId: targetUserId } });
    if (ver && previous !== profession) {
      const nowAssistant = profession === Profession.ASSISTANT;
      await this.prisma.clinicianVerification.update({
        where: { userId: targetUserId },
        data: {
          profession,
          reverifyReason: "PROFESSION_CHANGED" satisfies ReverifyReason,
          // A new profession needs its own evidence: back to the clinician to re-submit (assistants are never verified).
          status: VerificationStatus.UNVERIFIED,
          pendingAt: null,
          reviewedAt: null,
          reviewDurationMs: null,
          rejectReason: null,
          rejectReasonCode: null,
          verifiedAt: null,
          nextReverifyAt: null,
          expiryReminderStage: 0,
          ...(nowAssistant ? { verifiedProfession: null } : {}),
        },
      });
      await this.prisma.professionalRegistration.deleteMany({ where: { userId: targetUserId } });
      reverification = true;
    }
    await this.audit.recordEvent({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "clinician.profession.changed",
      resource: "User",
      resourceId: targetUserId,
      metadata: { from: previous, to: profession, supervisorUserId: supervisor, reverification },
    });
    return { userId: targetUserId, profession, supervisorUserId: supervisor, reverification };
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