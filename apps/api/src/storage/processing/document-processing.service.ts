import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../upload-blob.storage";
import type { UploadKind } from "../upload-kind";
import { processImage, bytesSha256 } from "./image-processor";
import { processPdf } from "./pdf-processor";
import { loadQualityPolicyConfig, resolveStorageQualityEnabled } from "./quality-policy";
import { adjustTenantStorageBytes } from "./storage-usage";

export type DocumentRefModel =
  | "PatientDocument"
  | "EncounterDocument"
  | "OperationDocument"
  | "PatientClinicalPhoto";

const REF_KIND: Record<DocumentRefModel, UploadKind> = {
  PatientDocument: "patients",
  EncounterDocument: "encounters",
  OperationDocument: "operations",
  PatientClinicalPhoto: "patients",
};

@Injectable()
export class DocumentProcessingService {
  private readonly log = new Logger(DocumentProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  async isEnabledForTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { storageQualityPipelineEnabled: true },
    });
    return resolveStorageQualityEnabled({
      env: this.config.get<string>("STORAGE_QUALITY_PIPELINE"),
      nodeEnv: this.config.get<string>("NODE_ENV") ?? process.env.NODE_ENV,
      deployTarget: this.config.get<string>("KIORLY_DEPLOY_TARGET") ?? process.env.KIORLY_DEPLOY_TARGET,
      tenantEnabled: tenant?.storageQualityPipelineEnabled,
    });
  }

  /** Enqueue after upload when pipeline is enabled. Never blocks the upload response path beyond the insert. */
  async enqueueProcessDocument(tenantId: string, refModel: DocumentRefModel, refId: string): Promise<void> {
    if (!(await this.isEnabledForTenant(tenantId))) return;
    const cfg = loadQualityPolicyConfig();
    // First enable → start two-week shadow window (keep originals of reduced files).
    await this.prisma.tenant.updateMany({
      where: { id: tenantId, storageQualityShadowUntil: null },
      data: {
        storageQualityShadowUntil: new Date(Date.now() + cfg.shadowModeDays * 24 * 60 * 60_000),
      },
    });
    await this.prisma.storageJob.create({
      data: {
        id: randomUUID(),
        tenantId,
        kind: "PROCESS_DOCUMENT",
        refModel,
        refId,
        status: "PENDING",
        runAfter: new Date(),
      },
    });
    await this.updateRow(refModel, refId, { processingStatus: "PENDING" }).catch(() => undefined);
  }

  async processOneJob(jobId: string): Promise<void> {
    const job = await this.prisma.storageJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== "PROCESS_DOCUMENT") return;
    if (job.status === "DONE") return;

    const locked = await this.prisma.storageJob.updateMany({
      where: { id: jobId, status: { in: ["PENDING", "FAILED"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
      data: {
        status: "PROCESSING",
        lockedUntil: new Date(Date.now() + 5 * 60_000),
        attempts: { increment: 1 },
      },
    });
    if (locked.count === 0) return;

    const refModel = job.refModel as DocumentRefModel;
    const kind = REF_KIND[refModel];
    if (!kind) {
      await this.failJob(jobId, "unknown_ref_model");
      return;
    }

    try {
      const row = await this.loadRow(refModel, job.refId, job.tenantId);
      if (!row) {
        await this.failJob(jobId, "row_missing");
        return;
      }
      if (row.processingStatus === "DONE" || row.processingStatus === "SKIPPED") {
        await this.prisma.storageJob.update({ where: { id: jobId }, data: { status: "DONE", lockedUntil: null } });
        return;
      }

      const stream = await this.uploads.getReadStream(kind, row.relativePath);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      const original = Buffer.concat(chunks);
      const cfg = loadQualityPolicyConfig();
      const mime = row.mimeType || "application/octet-stream";
      const sha = bytesSha256(original);

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: job.tenantId },
        select: { keepOriginalUploads: true, storageQualityShadowUntil: true },
      });
      const shadow =
        tenant?.storageQualityShadowUntil != null && tenant.storageQualityShadowUntil.getTime() > Date.now();
      const keepOrig = Boolean(tenant?.keepOriginalUploads) || shadow;

      let nextBody: Buffer = original;
      let nextMime = mime;
      let qualityNote: string | null = "ORIGINAL_KEPT";
      let ssim: number | null = null;
      let qualityUsed: number | null = null;
      let longEdgeUsed: number | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let pageCount: number | null = null;
      let status = "DONE";
      let thumbSmall: string | null = null;
      let thumbLarge: string | null = null;
      let originalRelativePath: string | null = row.originalRelativePath;

      if (mime.startsWith("image/")) {
        const r = await processImage(original, mime, cfg);
        if (r.skipped) {
          status = "SKIPPED";
          qualityNote = "ORIGINAL_KEPT";
        } else {
          nextBody = Buffer.from(r.body);
          nextMime = r.mimeType;
          qualityNote = r.qualityNote;
          ssim = r.ssim;
          qualityUsed = r.qualityUsed;
          longEdgeUsed = r.longEdgeUsed;
          width = r.width;
          height = r.height;
          if (r.thumbs.small.length && r.thumbs.large.length) {
            thumbSmall = `${row.relativePath}-t256.webp`;
            thumbLarge = `${row.relativePath}-t1024.webp`;
            await this.uploads.put(kind, thumbSmall, Buffer.from(r.thumbs.small), "image/webp");
            await this.uploads.put(kind, thumbLarge, Buffer.from(r.thumbs.large), "image/webp");
          }
          let origStoredBytes = 0;
          if (keepOrig && r.qualityNote !== "ORIGINAL_KEPT" && bytesSha256(nextBody) !== sha) {
            originalRelativePath = row.relativePath.replace(/([^/]+)$/, "orig/$1");
            await this.uploads.put(kind, originalRelativePath, original, mime);
            origStoredBytes = original.length;
          }
          if (nextBody.length !== original.length || bytesSha256(nextBody) !== sha) {
            await this.uploads.put(kind, row.relativePath, nextBody, nextMime);
          }
          const thumbBytes = (r.thumbs.small?.length ?? 0) + (r.thumbs.large?.length ?? 0);
          // Meter: replace billed size with processed + thumbs + optional orig
          const prevBilled = row.sizeBytes ?? original.length;
          const nextBilled = nextBody.length + thumbBytes + origStoredBytes;
          await adjustTenantStorageBytes(this.prisma, job.tenantId, nextBilled - prevBilled);
        }
      } else if (mime === "application/pdf" || mime.includes("pdf")) {
        const r = await processPdf(original, cfg);
        if (r.rejected) {
          await this.failJob(jobId, r.rejectReason ?? "pdf_rejected");
          await this.updateRow(refModel, job.refId, {
            processingStatus: "FAILED",
            processingError: r.rejectReason ?? "rejected",
          });
          return;
        }
        nextBody = Buffer.from(r.body);
        qualityNote = r.qualityNote;
        pageCount = r.pageCount;
        let origStoredBytes = 0;
        if (keepOrig && r.qualityNote !== "ORIGINAL_KEPT" && nextBody.length !== original.length) {
          originalRelativePath = row.relativePath.replace(/([^/]+)$/, "orig/$1");
          await this.uploads.put(kind, originalRelativePath, original, mime);
          origStoredBytes = original.length;
        }
        if (nextBody.length !== original.length) {
          await this.uploads.put(kind, row.relativePath, nextBody, mime);
        }
        const prevBilled = row.sizeBytes ?? original.length;
        await adjustTenantStorageBytes(
          this.prisma,
          job.tenantId,
          nextBody.length + origStoredBytes - prevBilled,
        );
      } else {
        status = "SKIPPED";
        qualityNote = "ORIGINAL_KEPT";
      }

      await this.updateRow(refModel, job.refId, {
        sha256: sha,
        originalSizeBytes: original.length,
        sizeBytes: nextBody.length,
        mimeType: nextMime,
        thumbSmallRelativePath: thumbSmall,
        thumbLargeRelativePath: thumbLarge,
        originalRelativePath,
        processingStatus: status,
        processingError: null,
        processedAt: new Date(),
        width,
        height,
        pageCount,
        qualityNote,
        ssim,
        qualityUsed,
        longEdgeUsed,
      });

      await this.prisma.storageJob.update({
        where: { id: jobId },
        data: { status: "DONE", lockedUntil: null, lastError: null },
      });
      this.log.log(`storage_job_done id=${jobId} refModel=${refModel} status=${status} bytes=${nextBody.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      this.log.warn(`storage_job_failed id=${jobId} err=${msg.slice(0, 120)}`);
      await this.failJob(jobId, msg.slice(0, 200));
      await this.updateRow(refModel, job.refId, {
        processingStatus: "FAILED",
        processingError: msg.slice(0, 200),
      }).catch(() => undefined);
    }
  }

  private async failJob(jobId: string, err: string) {
    const job = await this.prisma.storageJob.findUnique({ where: { id: jobId } });
    const attempts = (job?.attempts ?? 1);
    const permanent = attempts >= 5;
    await this.prisma.storageJob.update({
      where: { id: jobId },
      data: {
        status: permanent ? "FAILED" : "PENDING",
        lastError: err.slice(0, 500),
        lockedUntil: null,
        runAfter: permanent ? new Date() : new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 30 * 60_000)),
      },
    });
  }

  private async loadRow(refModel: DocumentRefModel, id: string, tenantId: string) {
    switch (refModel) {
      case "PatientDocument":
        return this.prisma.patientDocument.findFirst({ where: { id, tenantId } });
      case "EncounterDocument":
        return this.prisma.encounterDocument.findFirst({ where: { id, tenantId } });
      case "OperationDocument":
        return this.prisma.operationDocument.findFirst({ where: { id, tenantId } });
      case "PatientClinicalPhoto":
        return this.prisma.patientClinicalPhoto.findFirst({ where: { id, tenantId } });
      default:
        return null;
    }
  }

  private async updateRow(refModel: DocumentRefModel, id: string, data: Record<string, unknown>) {
    switch (refModel) {
      case "PatientDocument":
        return this.prisma.patientDocument.update({ where: { id }, data: data as never });
      case "EncounterDocument":
        return this.prisma.encounterDocument.update({ where: { id }, data: data as never });
      case "OperationDocument":
        return this.prisma.operationDocument.update({ where: { id }, data: data as never });
      case "PatientClinicalPhoto":
        return this.prisma.patientClinicalPhoto.update({ where: { id }, data: data as never });
      default:
        return null;
    }
  }

  /** Claim a batch with SKIP LOCKED semantics via timed lock. */
  async claimPendingIds(limit = 5): Promise<string[]> {
    const rows = await this.prisma.storageJob.findMany({
      where: {
        status: "PENDING",
        runAfter: { lte: new Date() },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
