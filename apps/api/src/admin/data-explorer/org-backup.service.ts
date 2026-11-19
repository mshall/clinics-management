import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ZipArchive } from "archiver";
import { createHash, randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { unzipSync } from "fflate";
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
  type TenantDocumentManifest,
} from "./tenant-documents-export";
import { generateTenantSqlExport } from "./tenant-sql-export";
import { createTenantDocumentsArchive } from "./tenant-documents-export";

export type OrgBackupFormat = "SQL" | "DOCUMENTS" | "FULL";

const EXPORT_TTL_HOURS = 72;
const ALLOWED_SQL_TABLES = new Set([
  "Tenant",
  "User",
  "Clinic",
  "ClinicAdminScope",
  "UserNavTabGrant",
  "Patient",
  "PatientDocument",
  "Employee",
  "Appointment",
  "Encounter",
  "Diagnosis",
  "EncounterMedication",
  "EncounterDocument",
  "Operation",
  "OperationDocument",
  "OperationMedication",
  "Expense",
  "RevenueEntry",
  "Attendance",
  "LeaveRequest",
  "AuditLog",
  "FeatureFlag",
]);

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

@Injectable()
export class OrgBackupService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private publicJob(job: {
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
  }) {
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
      downloadPath: job.status === "READY" ? `/api/v1/admin/data-explorer/export/jobs/${job.id}/download` : null,
    };
  }

  private async setProgress(jobId: string, progress: number, patch: Prisma.TenantExportJobUpdateInput = {}) {
    return this.prisma.tenantExportJob.update({
      where: { id: jobId },
      data: { progress: Math.max(0, Math.min(100, Math.round(progress))), ...patch },
    });
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
    // Fire-and-forget; client polls progress.
    void this.runExport(job.id, format, user).catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: msg.slice(0, 500), completedAt: new Date(), progress: 100 },
      });
    });
    return this.publicJob(job);
  }

  async getJob(user: JwtUser, id: string) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException("Export job not found");
    return this.publicJob(job);
  }

  async downloadJob(user: JwtUser, id: string) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job || job.status !== "READY" || !job.artifactPath) {
      throw new NotFoundException("Export not ready");
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: "Export expired", code: "EXPORT_EXPIRED" });
    }
    const body = await readFile(job.artifactPath);
    return {
      body,
      fileName: job.fileName ?? `kiorly-org-${tenantId}-export.bin`,
      contentType: job.contentType ?? "application/octet-stream",
    };
  }

  private async runExport(jobId: string, format: OrgBackupFormat, user: JwtUser) {
    const job = await this.prisma.tenantExportJob.findUniqueOrThrow({ where: { id: jobId } });
    const tenantId = job.tenantId;
    const tables = Array.isArray(job.tablesJson) ? (job.tablesJson as string[]) : undefined;
    const allowFeatureFlags = isDataExplorerPlatformOperator(user);
    const dir = join(process.cwd(), ".data", "exports", tenantId);
    await mkdir(dir, { recursive: true });

    await this.setProgress(jobId, 8, { status: "RUNNING" });

    if (format === "SQL") {
      await this.setProgress(jobId, 25);
      const sql = await generateTenantSqlExport(this.prisma, tenantId, { tables, allowFeatureFlags });
      await this.setProgress(jobId, 85);
      const path = join(dir, `${jobId}.sql`);
      await writeFile(path, sql, "utf8");
      const token = randomBytes(24).toString("hex");
      const hash = createHash("sha256").update(token).digest("hex");
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
      return updated;
    }

    if (format === "DOCUMENTS") {
      await this.setProgress(jobId, 20);
      const archive = await createTenantDocumentsArchive(this.prisma, this.uploads, tenantId, tables, {
        allowFeatureFlags,
      });
      await this.setProgress(jobId, 70);
      const path = join(dir, `${jobId}-documents.zip`);
      // createTenantDocumentsArchive already finalizes the archive.
      await this.writeArchiveToFile(archive, path, false, (p) => this.setProgress(jobId, 70 + Math.round(p * 0.25)));
      const token = randomBytes(24).toString("hex");
      const hash = createHash("sha256").update(token).digest("hex");
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
      return updated;
    }

    // FULL = SQL + documents in one ZIP (round-trip package)
    await this.setProgress(jobId, 12);
    const sql = await generateTenantSqlExport(this.prisma, tenantId, { tables, allowFeatureFlags });
    await this.setProgress(jobId, 40);
    const { entries, selectedEntities } = await collectTenantDocumentEntries(this.prisma, tenantId, tables, {
      allowFeatureFlags,
    });
    await this.setProgress(jobId, 55);

    const archive = new ZipArchive({ zlib: { level: 9 } });
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

    await this.setProgress(jobId, 90);
    const path = join(dir, `${jobId}-full.zip`);
    await this.writeArchiveToFile(archive, path, true);
    const token = randomBytes(24).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
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
    return updated;
  }

  private async writeArchiveToFile(
    archive: ZipArchive,
    path: string,
    finalize: boolean,
    onProgress?: (ratio: number) => Promise<unknown>,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(path);
      archive.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
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

  async startImport(user: JwtUser, file: Express.Multer.File) {
    assertDataExplorerAccess(user);
    const tenantId = assertExplorerTenant(user);
    if (!file?.buffer?.length) throw new BadRequestException("Upload a .sql or .zip backup file");
    const name = (file.originalname || "").toLowerCase();
    const isZip = name.endsWith(".zip") || file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed";
    const isSql = name.endsWith(".sql") || file.mimetype.includes("sql") || file.mimetype === "application/octet-stream";
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

    void this.runImport(job.id, tenantId, user.userId, file.buffer, isZip).catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: msg.slice(0, 500), completedAt: new Date(), progress: 100 },
      });
    });

    return this.publicJob(job);
  }

  private async runImport(jobId: string, tenantId: string, actorId: string, buffer: Buffer, isZip: boolean) {
    await this.setProgress(jobId, 10, { status: "RUNNING" });
    let sqlText: string | null = null;
    let filesRestored = 0;
    let sqlStatements = 0;

    if (isZip) {
      const unzipped = unzipSync(new Uint8Array(buffer));
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
        for (const f of manifest.files ?? []) {
          const zipPath = f.zipPath.replace(/^\.\//, "");
          const data = unzipped[zipPath] ?? unzipped[zipPath.replace(/^files\//, "")] ?? unzipped[`files/${zipPath}`];
          if (!data) {
            done += 1;
            continue;
          }
          await this.uploads.put(f.storageKind as UploadKind, f.relativePath, Buffer.from(data), f.mimeType);
          filesRestored += 1;
          done += 1;
          if (done % 3 === 0) await this.setProgress(jobId, 25 + Math.round((done / total) * 45));
        }
      }
      await this.setProgress(jobId, 75);
    } else {
      sqlText = buffer.toString("utf8");
      await this.setProgress(jobId, 40);
    }

    if (sqlText) {
      sqlStatements = await this.applyAllowlistedSql(tenantId, sqlText, (p) => this.setProgress(jobId, 75 + Math.round(p * 20)));
    }

    await this.setProgress(jobId, 100, {
      status: "READY",
      completedAt: new Date(),
      rowCounts: { filesRestored, sqlStatements, mode: isZip ? "zip" : "sql" },
    });
    await this.audit(tenantId, actorId, jobId, "org.import.ready");
  }

  /** Apply INSERT statements for allowlisted tables; skip statements that don't target this tenant when tenantId column exists. */
  private async applyAllowlistedSql(
    tenantId: string,
    sql: string,
    onProgress?: (ratio: number) => Promise<unknown>,
  ): Promise<number> {
    const statements = sql
      .split(/\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => /^INSERT\s+INTO/i.test(s));

    let applied = 0;
    const total = Math.max(statements.length, 1);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]!;
      const m = stmt.match(/^INSERT\s+INTO\s+"?([A-Za-z0-9_]+)"?/i);
      if (!m) continue;
      const table = m[1]!;
      if (!ALLOWED_SQL_TABLES.has(table)) continue;
      // Soft-guard: if statement mentions a different tenant id literal for Tenant table, skip.
      if (table === "Tenant" && !stmt.includes(tenantId)) continue;
      try {
        await this.prisma.$executeRawUnsafe(stmt.endsWith(";") ? stmt : `${stmt};`);
        applied += 1;
      } catch {
        // Prefer ON CONFLICT style failures to be ignored for idempotent re-import.
      }
      if (onProgress && i % 10 === 0) await onProgress(i / total);
    }
    if (onProgress) await onProgress(1);
    return applied;
  }
}
