import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ZipArchive } from "archiver";
import { createHash, randomBytes } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { buildInsert, checkRestoreStatement, parseExportInserts, restorableObjectPath, safeUnzip, UnzipLimitError } from "./org-backup-safe";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { PrismaService } from "../../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../../storage/upload-blob.storage";
import type { UploadKind } from "../../storage/upload-kind";
import {
  assertDataExplorerAccess,
  assertExplorerTenant,
  isDataExplorerPlatformOperator,
} from "./data-explorer-access";
import {
  collectTenantDocumentEntries,
  createTenantDocumentsArchive,
  type TenantDocumentManifest,
} from "./tenant-documents-export";
import { generateTenantSqlExport } from "./tenant-sql-export";
import { ExportCancelledError } from "./org-backup-errors";

export type OrgBackupFormat = "SQL" | "DOCUMENTS" | "FULL";
export { ExportCancelledError };

const EXPORT_TTL_HOURS = 72;
const IMPORT_MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024; // actually inflated bytes across all entries
const IMPORT_MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const IMPORT_MAX_ZIP_ENTRIES = 100_000;

function scopeForFormat(format: OrgBackupFormat): string {
  if (format === "SQL") return "ORG_SQL";
  if (format === "DOCUMENTS") return "ORG_DOCUMENTS";
  return "ORG_FULL";
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export type OrgBackupArtifact = {
  artifactPath: string;
  fileName: string;
  contentType: string;
  size: number;
};

@Injectable()
export class OrgBackupService {
  /** Plain download tokens kept in-process so async jobs can expose a native browser download URL. */
  private readonly downloadTokens = new Map<string, string>();
  /** In-flight cancel signals for RUNNING export/import jobs. */
  private readonly cancelRequested = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private async throwIfCancelled(jobId: string): Promise<void> {
    if (this.cancelRequested.has(jobId)) throw new ExportCancelledError();
    const row = await this.prisma.tenantExportJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (row?.status === "CANCELLED") throw new ExportCancelledError();
  }

  private async cleanupPartialArtifact(artifactPath: string | null | undefined) {
    if (!artifactPath) return;
    await unlink(artifactPath).catch(() => undefined);
  }

  private publicJob(
    job: {
      id: string;
      scope: string;
      status: string;
      progress: number;
      fileName: string | null;
      contentType: string | null;
      expiresAt: Date | null;
      completedAt: Date | null;
      rowCounts: unknown;
      error: string | null;
    },
    opts?: { downloadToken?: string | null },
  ) {
    const token = opts?.downloadToken ?? this.downloadTokens.get(job.id) ?? null;
    const ready = job.status === "READY";
    return {
      id: job.id,
      scope: job.scope,
      status: job.status,
      progress: job.progress,
      fileName: job.fileName,
      contentType: job.contentType,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      rowCounts: job.rowCounts,
      error: job.error,
      downloadPath: ready ? `/api/v1/admin/data-explorer/export/jobs/${job.id}/download` : null,
      downloadToken: ready ? token : null,
      /** Token URL for native browser download (no Authorization header / no in-memory blob). */
      downloadUrl:
        ready && token
          ? `/api/v1/admin/org-backup/download?token=${encodeURIComponent(token)}`
          : null,
    };
  }

  private async setProgress(jobId: string, progress: number, patch: Prisma.TenantExportJobUpdateInput = {}) {
    if (this.cancelRequested.has(jobId)) throw new ExportCancelledError();
    const current = await this.prisma.tenantExportJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (current?.status === "CANCELLED") throw new ExportCancelledError();
    // Never mark READY if the user already cancelled (race with cancelJob).
    if (patch.status === "READY" && this.cancelRequested.has(jobId)) {
      throw new ExportCancelledError();
    }
    return this.prisma.tenantExportJob.update({
      where: { id: jobId },
      data: { progress: Math.max(0, Math.min(100, Math.round(progress))), ...patch },
    });
  }

  private mintDownloadToken(jobId: string): { token: string; hash: string } {
    const token = randomBytes(24).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    this.downloadTokens.set(jobId, token);
    return { token, hash };
  }

  /** Remint token after process restart so READY jobs remain downloadable via token URL. */
  private async ensureDownloadToken(job: { id: string; status: string; downloadTokenHash: string | null }) {
    if (job.status !== "READY") return null;
    const existing = this.downloadTokens.get(job.id);
    if (existing) return existing;
    const { token, hash } = this.mintDownloadToken(job.id);
    await this.prisma.tenantExportJob.update({
      where: { id: job.id },
      data: { downloadTokenHash: hash },
    });
    return token;
  }

  async startExport(user: JwtUser, format: OrgBackupFormat, tables?: string[]) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const resolved = tables?.filter(Boolean);
    if (resolved && resolved.length === 0) {
      throw new BadRequestException("Select at least one entity to export");
    }
    const job = await this.prisma.tenantExportJob.create({
      data: {
        tenantId,
        scope: scopeForFormat(format),
        status: "RUNNING",
        progress: 2,
        ...(resolved ? { tablesJson: resolved } : {}),
        requestedBy: user.userId,
      },
    });
    // Fire-and-forget; client polls progress (or dismisses UI and relies on toast + job list).
    void this.runExport(job.id, format, user).catch(async (e) => {
      this.cancelRequested.delete(job.id);
      if (e instanceof ExportCancelledError) return;
      const current = await this.prisma.tenantExportJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (current?.status === "CANCELLED") return;
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: msg.slice(0, 500),
          completedAt: new Date(),
          // Keep last progress — do not jump to 100% on failure (confuses the UI).
        },
      });
    });
    return this.publicJob(job);
  }

  async cancelJob(user: JwtUser, id: string) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException("Export job not found");
    if (job.status !== "PENDING" && job.status !== "RUNNING") {
      return this.publicJob(job, { downloadToken: await this.ensureDownloadToken(job) });
    }
    this.cancelRequested.add(id);
    const updated = await this.prisma.tenantExportJob.update({
      where: { id },
      data: {
        status: "CANCELLED",
        error: "Cancelled by user",
        completedAt: new Date(),
      },
    });
    await this.cleanupPartialArtifact(job.artifactPath);
    await this.audit(tenantId, user.userId, id, "org.export.cancelled");
    return this.publicJob(updated);
  }

  async getJob(user: JwtUser, id: string) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException("Export job not found");
    const downloadToken = await this.ensureDownloadToken(job);
    return this.publicJob(job, { downloadToken });
  }

  async listRecentJobs(user: JwtUser, limit = 12) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const take = Math.min(Math.max(limit, 1), 40);
    const jobs = await this.prisma.tenantExportJob.findMany({
      where: {
        tenantId,
        scope: { in: ["ORG_SQL", "ORG_DOCUMENTS", "ORG_FULL", "ORG_IMPORT"] },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    const out = [];
    for (const job of jobs) {
      const downloadToken = await this.ensureDownloadToken(job);
      out.push(this.publicJob(job, { downloadToken }));
    }
    return { items: out };
  }

  async downloadJob(user: JwtUser, id: string): Promise<OrgBackupArtifact> {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job || job.status !== "READY" || !job.artifactPath) {
      throw new NotFoundException("Export not ready");
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: "Export expired", code: "EXPORT_EXPIRED" });
    }
    const size = (await stat(job.artifactPath)).size;
    return {
      artifactPath: job.artifactPath,
      fileName: job.fileName ?? `kiorly-org-${tenantId}-export.bin`,
      contentType: job.contentType ?? "application/octet-stream",
      size,
    };
  }

  async downloadByToken(token: string): Promise<OrgBackupArtifact> {
    const trimmed = token?.trim() ?? "";
    if (!trimmed) throw new NotFoundException("Export link invalid or expired");
    const hash = createHash("sha256").update(trimmed).digest("hex");
    const job = await this.prisma.tenantExportJob.findFirst({ where: { downloadTokenHash: hash } });
    if (!job || job.status !== "READY" || !job.artifactPath) {
      throw new NotFoundException("Export link invalid or expired");
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: "Export link expired", code: "EXPORT_EXPIRED" });
    }
    // Refresh in-memory map so subsequent polls keep the same token URL.
    this.downloadTokens.set(job.id, trimmed);
    const size = (await stat(job.artifactPath)).size;
    return {
      artifactPath: job.artifactPath,
      fileName: job.fileName ?? `kiorly-org-${job.tenantId}-export.bin`,
      contentType: job.contentType ?? "application/octet-stream",
      size,
    };
  }

  private async runExport(jobId: string, format: OrgBackupFormat, user: JwtUser) {
    let partialPath: string | null = null;
    try {
      await this.throwIfCancelled(jobId);
      const job = await this.prisma.tenantExportJob.findUniqueOrThrow({ where: { id: jobId } });
      const tenantId = job.tenantId;
      const tables = Array.isArray(job.tablesJson) ? (job.tablesJson as string[]) : undefined;
      const allowFeatureFlags = isDataExplorerPlatformOperator(user);
      const dir = join(process.cwd(), ".data", "exports", tenantId);
      await mkdir(dir, { recursive: true });

      await this.setProgress(jobId, 8, { status: "RUNNING" });
      await this.throwIfCancelled(jobId);

      if (format === "SQL") {
        await this.setProgress(jobId, 25);
        await this.throwIfCancelled(jobId);
        const sql = await generateTenantSqlExport(this.prisma, tenantId, { tables, allowFeatureFlags });
        await this.throwIfCancelled(jobId);
        await this.setProgress(jobId, 85);
        const path = join(dir, `${jobId}.sql`);
        partialPath = path;
        await writeFile(path, sql, "utf8");
        await this.throwIfCancelled(jobId);
        const { token, hash } = this.mintDownloadToken(jobId);
        const updated = await this.setProgress(jobId, 100, {
          status: "READY",
          artifactPath: path,
          fileName: `kiorly-org-${tenantId}-export.sql`,
          contentType: "application/sql; charset=utf-8",
          downloadTokenHash: hash,
          expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3600_000),
          completedAt: new Date(),
          rowCounts: { bytes: Buffer.byteLength(sql, "utf8") },
        });
        await this.audit(tenantId, user.userId, jobId, "org.export.sql.ready");
        return this.publicJob(updated, { downloadToken: token });
      }

      if (format === "DOCUMENTS") {
        await this.setProgress(jobId, 20);
        await this.throwIfCancelled(jobId);
        const archive = await createTenantDocumentsArchive(this.prisma, this.uploads, tenantId, tables, {
          allowFeatureFlags,
          finalize: false,
        });
        await this.throwIfCancelled(jobId);
        await this.setProgress(jobId, 70);
        const path = join(dir, `${jobId}-documents.zip`);
        partialPath = path;
        await this.writeArchiveToFile(archive, path, true, async (p) => {
          await this.throwIfCancelled(jobId);
          await this.setProgress(jobId, 70 + Math.round(p * 25));
        });
        await this.throwIfCancelled(jobId);
        const { token, hash } = this.mintDownloadToken(jobId);
        const updated = await this.setProgress(jobId, 100, {
          status: "READY",
          artifactPath: path,
          fileName: `kiorly-org-${tenantId}-documents.zip`,
          contentType: "application/zip",
          downloadTokenHash: hash,
          expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3600_000),
          completedAt: new Date(),
        });
        await this.audit(tenantId, user.userId, jobId, "org.export.documents.ready");
        return this.publicJob(updated, { downloadToken: token });
      }

      // FULL = SQL + documents in one ZIP (round-trip package)
      await this.setProgress(jobId, 12);
      await this.throwIfCancelled(jobId);
      const sql = await generateTenantSqlExport(this.prisma, tenantId, { tables, allowFeatureFlags });
      await this.throwIfCancelled(jobId);
      await this.setProgress(jobId, 40);
      const { entries, selectedEntities } = await collectTenantDocumentEntries(this.prisma, tenantId, tables, {
        allowFeatureFlags,
      });
      await this.throwIfCancelled(jobId);
      await this.setProgress(jobId, 55);

      const path = join(dir, `${jobId}-full.zip`);
      partialPath = path;
      const archive = new ZipArchive({ zlib: { level: 6 } });
      // Pipe early so entries stream to disk instead of buffering the whole ZIP in memory.
      const writePromise = this.writeArchiveToFile(archive, path, false);

      archive.append(sql, { name: "organization-export.sql" });
      const manifest: TenantDocumentManifest = {
        tenantId,
        exportedAt: new Date().toISOString(),
        selectedEntities,
        files: [],
        skipped: [],
      };
      let i = 0;
      for (const entry of entries) {
        await this.throwIfCancelled(jobId);
        i += 1;
        try {
          await this.uploads.assertExists(entry.kind, entry.relativePath);
          const body = await this.readUpload(entry.kind, entry.relativePath);
          archive.append(body, { name: `files/${entry.zipPath}` });
          manifest.files.push({
            zipPath: `files/${entry.zipPath}`,
            originalFileName: entry.originalFileName,
            mimeType: entry.mimeType,
            entityType: entry.entityType,
            entityId: entry.entityId,
            storageKind: entry.kind,
            relativePath: entry.relativePath,
          });
        } catch {
          manifest.skipped.push({ zipPath: `files/${entry.zipPath}`, reason: "not_found_in_storage" });
        }
        if (i % 5 === 0) {
          await this.setProgress(jobId, 55 + Math.round((i / Math.max(entries.length, 1)) * 30));
        }
      }
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.append(
        [
          "Kiorly organization backup package",
          "- organization-export.sql — database rows (run after Prisma migrate on target)",
          "- files/ — uploaded patient / encounter / operation / employee / expense documents",
          "- manifest.json — maps each file back to storage kind + relativePath for import",
          "",
          "Import via Admin → Organization data → Import backup (ZIP or SQL).",
          "",
        ].join("\n"),
        { name: "README.txt" },
      );

      await this.throwIfCancelled(jobId);
      await this.setProgress(jobId, 90);
      await archive.finalize();
      await writePromise;
      await this.throwIfCancelled(jobId);

      const { token, hash } = this.mintDownloadToken(jobId);
      const updated = await this.setProgress(jobId, 100, {
        status: "READY",
        artifactPath: path,
        fileName: `kiorly-org-${tenantId}-full-backup.zip`,
        contentType: "application/zip",
        downloadTokenHash: hash,
        expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3600_000),
        completedAt: new Date(),
        rowCounts: { sqlBytes: Buffer.byteLength(sql, "utf8"), files: manifest.files.length },
      });
      await this.audit(tenantId, user.userId, jobId, "org.export.full.ready");
      return this.publicJob(updated, { downloadToken: token });
    } catch (e) {
      if (e instanceof ExportCancelledError) {
        await this.cleanupPartialArtifact(partialPath);
        return;
      }
      throw e;
    } finally {
      this.cancelRequested.delete(jobId);
    }
  }

  private async writeArchiveToFile(
    archive: ZipArchive,
    path: string,
    finalize: boolean,
    onProgress?: (ratio: number) => Promise<unknown>,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(path);
      const fail = (err: Error) => reject(err);
      archive.once("error", fail);
      out.once("error", fail);
      out.once("finish", () => resolve());
      if (onProgress) {
        archive.on("progress", (p) => {
          const entries = p.entries;
          if (entries.total > 0) void onProgress(entries.processed / entries.total);
        });
      }
      archive.pipe(out);
      if (finalize) void archive.finalize();
    });
  }

  private async readUpload(kind: UploadKind, relativePath: string): Promise<Buffer> {
    const stream = await this.uploads.getReadStream(kind, relativePath);
    return streamToBuffer(stream);
  }

  private async audit(tenantId: string, actorId: string, jobId: string, action: string) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        resource: "TenantExportJob",
        resourceId: jobId,
        metadata: {},
      },
    });
  }

  async startImport(
    user: JwtUser,
    file: Express.Multer.File & { path?: string },
  ) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const hasBuffer = Boolean(file?.buffer?.length);
    const hasPath = Boolean(file?.path);
    if (!hasBuffer && !hasPath) throw new BadRequestException("Upload a .sql or .zip backup file");
    const name = (file.originalname || "").toLowerCase();
    const isZip =
      name.endsWith(".zip") ||
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed";
    const isSql =
      name.endsWith(".sql") ||
      (file.mimetype ?? "").includes("sql") ||
      file.mimetype === "application/octet-stream";
    if (!isZip && !isSql) throw new BadRequestException("Only .sql or .zip backups are supported");

    const job = await this.prisma.tenantExportJob.create({
      data: {
        tenantId,
        scope: "ORG_IMPORT",
        status: "RUNNING",
        progress: 5,
        requestedBy: user.userId,
        fileName: file.originalname,
        contentType: file.mimetype,
      },
    });

    void this.runImport(job.id, tenantId, user.userId, file, isZip).catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: msg.slice(0, 500), completedAt: new Date() },
      });
      if (file.path) {
        await unlink(file.path).catch(() => undefined);
      }
    });

    return this.publicJob(job);
  }

  private async loadImportBuffer(file: Express.Multer.File & { path?: string }): Promise<Buffer> {
    if (file.buffer?.length) return file.buffer;
    if (file.path) return readFile(file.path);
    throw new BadRequestException("Upload a .sql or .zip backup file");
  }

  private async runImport(
    jobId: string,
    tenantId: string,
    actorId: string,
    file: Express.Multer.File & { path?: string },
    isZip: boolean,
  ) {
    await this.setProgress(jobId, 10, { status: "RUNNING" });
    let sqlText: string | null = null;
    let filesRestored = 0;
    let filesSkipped = 0;
    let sqlApplied = 0;
    let sqlAttempted = 0;
    let sqlRejected = 0;

    try {
      const buffer = await this.loadImportBuffer(file);
      await this.setProgress(jobId, 18);

      if (isZip) {
        let unzipped: Record<string, Uint8Array>;
        try {
          // zip-bomb safe: caps are enforced on the bytes actually inflated, not on the sizes the archive declares
          unzipped = safeUnzip(new Uint8Array(buffer), { maxTotal: IMPORT_MAX_UNZIPPED_BYTES, maxEntries: IMPORT_MAX_ZIP_ENTRIES, maxEntry: IMPORT_MAX_ENTRY_BYTES });
        } catch (e) {
          if (e instanceof UnzipLimitError) throw new BadRequestException(`Backup archive rejected: ${e.message}`);
          throw new BadRequestException("Backup archive could not be read");
        }
        await this.setProgress(jobId, 25);
        const sqlEntry =
          unzipped["organization-export.sql"] ??
          unzipped["organization_export.sql"] ??
          Object.entries(unzipped).find(([k]) => k.toLowerCase().endsWith(".sql"))?.[1];
        if (sqlEntry) sqlText = Buffer.from(sqlEntry).toString("utf8");

        const manifestRaw = unzipped["manifest.json"];
        if (manifestRaw) {
          const manifest = JSON.parse(Buffer.from(manifestRaw).toString("utf8")) as TenantDocumentManifest;
          if (manifest.tenantId && manifest.tenantId !== tenantId) {
            throw new BadRequestException("Backup tenantId does not match the current organization");
          }
          const total = Math.max(manifest.files?.length ?? 0, 1);
          let done = 0;
          const ownUsers = new Set((await this.prisma.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id));
          for (const f of manifest.files ?? []) {
            const zipPath = String(f.zipPath ?? "").replace(/^\.\//, "");
            const data =
              unzipped[zipPath] ??
              unzipped[zipPath.replace(/^files\//, "")] ??
              unzipped[`files/${zipPath}`];
            // The manifest is attacker-controlled: only keys inside THIS tenant's own folder are written (no `..`, no other tenant's prefix, no platform kinds)
            const target = restorableObjectPath(String(f.storageKind ?? ""), String(f.relativePath ?? ""), tenantId, ownUsers);
            if (!data || !target) {
              if (data && !target) filesSkipped += 1;
              done += 1;
              continue;
            }
            await this.uploads.put(f.storageKind as UploadKind, target, Buffer.from(data), f.mimeType);
            filesRestored += 1;
            done += 1;
            if (done % 3 === 0) await this.setProgress(jobId, 25 + Math.round((done / total) * 45));
          }
        } else if (!sqlText) {
          throw new BadRequestException(
            "ZIP must contain organization-export.sql and/or manifest.json (same layout as full backup export)",
          );
        }
        await this.setProgress(jobId, 75);
      } else {
        sqlText = buffer.toString("utf8");
        await this.setProgress(jobId, 40);
      }

      if (sqlText) {
        const result = await this.applyAllowlistedSql(tenantId, sqlText, (p) =>
          this.setProgress(jobId, 75 + Math.round(p * 20)),
        );
        sqlApplied = result.applied;
        sqlAttempted = result.attempted;
        sqlRejected = result.rejected;
      }

      await this.setProgress(jobId, 100, {
        status: "READY",
        completedAt: new Date(),
        rowCounts: {
          filesRestored,
          filesSkipped,
          sqlRejected,
          sqlStatements: sqlApplied,
          sqlAttempted,
          mode: isZip ? "zip" : "sql",
        },
      });
      await this.audit(tenantId, actorId, jobId, "org.import.ready");
    } finally {
      if (file.path) {
        await unlink(file.path).catch(() => undefined);
      }
    }
  }

  /**
   * Restore rows from an uploaded backup. The text is NEVER executed: it is parsed with the strict exporter grammar and each statement is rebuilt from
   * validated tokens (see org-backup-safe.ts). Only INSERTs into this tenant's own tables; the tenantId literal and every foreign key must belong to the
   * restoring tenant (or to a row inserted earlier in this same restore); conflicts are skipped, never updated.
   */
  private async applyAllowlistedSql(
    tenantId: string,
    sql: string,
    onProgress?: (ratio: number) => Promise<unknown>,
  ): Promise<{ applied: number; attempted: number; rejected: number }> {
    const { statements, rejected: parseRejected } = parseExportInserts(sql);
    const restoredIds = new Map<string, Set<string>>(); // table -> ids inserted by this restore
    let applied = 0, attempted = 0, rejected = parseRejected;
    const total = Math.max(statements.length, 1);
    for (let i = 0; i < statements.length; i++) {
      const st = statements[i]!;
      const verdict = checkRestoreStatement(st, tenantId);
      if (!verdict.ok) { rejected += 1; continue; }
      let parentsOk = true;
      for (const fk of verdict.fks) {
        if (restoredIds.get(fk.parent)?.has(fk.id)) continue;
        if (!(await this.parentBelongsToTenant(fk.parent, fk.id, tenantId))) { parentsOk = false; break; }
      }
      if (!parentsOk) { rejected += 1; continue; }
      attempted += 1;
      try {
        await this.prisma.$executeRawUnsafe(`${buildInsert(st)};`); // rebuilt from validated tokens: no uploaded SQL text reaches the database
        applied += 1;
        const idIdx = st.columns.indexOf("id");
        const idVal = st.values[idIdx];
        if (idVal?.kind === "str") { let set = restoredIds.get(st.table); if (!set) restoredIds.set(st.table, (set = new Set())); set.add(idVal.v); }
      } catch {
        // duplicate keys / constraint violations are skipped (idempotent re-import); existing rows are never updated
      }
      if (onProgress && i % 10 === 0) await onProgress(i / total);
    }
    if (onProgress) await onProgress(1);
    return { applied, attempted, rejected };
  }

  private async parentBelongsToTenant(parent: string, id: string, tenantId: string): Promise<boolean> {
    if (!/^[A-Za-z]+$/.test(parent)) return false;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(`SELECT 1 AS ok FROM "${parent}" WHERE id = $1 AND ("tenantId" = $2${parent === "ClinicalFormTemplate" ? ' OR "tenantId" IS NULL' : ""}) LIMIT 1`, id, tenantId); // built-in clinical templates are shared, everything else must be this tenant's
    return rows.length > 0;
  }

  /** Expose stream helper for controllers. */
  openArtifactStream(artifactPath: string) {
    return createReadStream(artifactPath);
  }
}
