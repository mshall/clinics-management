import { ZipArchive } from "archiver";
import type { PrismaService } from "../../prisma/prisma.service";
import type { UploadBlobStorage } from "../../storage/upload-blob.storage";
import type { UploadKind } from "../../storage/upload-kind";
import { resolveSqlExportKeys } from "./tenant-sql-export";

export type TenantDocumentExportEntry = {
  kind: UploadKind;
  relativePath: string;
  zipPath: string;
  originalFileName: string;
  mimeType: string;
  entityType: string;
  entityId: string;
};

export type TenantDocumentManifestFile = {
  zipPath: string;
  originalFileName: string;
  mimeType: string;
  entityType: string;
  entityId: string;
  storageKind: UploadKind;
  relativePath: string;
};

export type TenantDocumentManifest = {
  tenantId: string;
  exportedAt: string;
  selectedEntities: string[];
  files: TenantDocumentManifestFile[];
  skipped: Array<{ zipPath: string; reason: string }>;
};

const DOCUMENT_SOURCE_KEYS = new Set([
  "patients",
  "patient_documents",
  "encounter_documents",
  "employees",
  "expenses",
  "operation_documents",
]);

function documentSourceKeysFromExportKeys(exportKeys: string[]): string[] {
  const keys = new Set<string>();
  for (const key of exportKeys) {
    if (DOCUMENT_SOURCE_KEYS.has(key)) keys.add(key);
    if (key === "encounters") keys.add("encounter_documents");
    if (key === "operations") keys.add("operation_documents");
  }
  return [...keys];
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180) || "file";
}

function dedupeKey(kind: UploadKind, relativePath: string): string {
  return `${kind}:${relativePath}`;
}

async function readUploadBuffer(
  uploads: UploadBlobStorage,
  kind: UploadKind,
  relativePath: string,
): Promise<Buffer> {
  const stream = await uploads.getReadStream(kind, relativePath);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function collectTenantDocumentEntries(
  prisma: PrismaService,
  tenantId: string,
  requestedTables: string[] | undefined,
  opts: { allowFeatureFlags: boolean },
): Promise<{ entries: TenantDocumentExportEntry[]; selectedEntities: string[] }> {
  const exportKeys = resolveSqlExportKeys(requestedTables, opts);
  const sourceKeys = documentSourceKeysFromExportKeys(exportKeys);
  const entries: TenantDocumentExportEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: TenantDocumentExportEntry) => {
    const key = dedupeKey(entry.kind, entry.relativePath);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const key of sourceKeys) {
    switch (key) {
      case "patients": {
        const rows = await prisma.patient.findMany({
          where: { tenantId },
          select: {
            id: true,
            nationalIdDocRelativePath: true,
            nationalIdDocOriginalName: true,
            nationalIdDocMimeType: true,
          },
        });
        for (const row of rows) {
          if (!row.nationalIdDocRelativePath || !row.nationalIdDocOriginalName || !row.nationalIdDocMimeType) continue;
          const fileName = safeFileName(row.nationalIdDocOriginalName);
          push({
            kind: "patients",
            relativePath: row.nationalIdDocRelativePath,
            zipPath: `patients/${row.id}/national-id/${fileName}`,
            originalFileName: row.nationalIdDocOriginalName,
            mimeType: row.nationalIdDocMimeType,
            entityType: "patient_national_id",
            entityId: row.id,
          });
        }
        break;
      }
      case "patient_documents": {
        const rows = await prisma.patientDocument.findMany({
          where: { tenantId },
          select: {
            id: true,
            patientId: true,
            relativePath: true,
            originalFileName: true,
            mimeType: true,
          },
        });
        for (const row of rows) {
          const fileName = safeFileName(row.originalFileName);
          push({
            kind: "patients",
            relativePath: row.relativePath,
            zipPath: `patients/${row.patientId}/documents/${row.id}-${fileName}`,
            originalFileName: row.originalFileName,
            mimeType: row.mimeType,
            entityType: "patient_document",
            entityId: row.id,
          });
        }
        break;
      }
      case "encounter_documents": {
        const rows = await prisma.encounterDocument.findMany({
          where: { tenantId },
          select: {
            id: true,
            encounterId: true,
            relativePath: true,
            originalFileName: true,
            mimeType: true,
          },
        });
        for (const row of rows) {
          const fileName = safeFileName(row.originalFileName);
          push({
            kind: "encounters",
            relativePath: row.relativePath,
            zipPath: `encounters/${row.encounterId}/${row.id}-${fileName}`,
            originalFileName: row.originalFileName,
            mimeType: row.mimeType,
            entityType: "encounter_document",
            entityId: row.id,
          });
        }
        break;
      }
      case "employees": {
        const rows = await prisma.employee.findMany({
          where: { tenantId },
          select: {
            id: true,
            idDocRelativePath: true,
            idDocOriginalName: true,
            idDocMimeType: true,
          },
        });
        for (const row of rows) {
          if (!row.idDocRelativePath || !row.idDocOriginalName || !row.idDocMimeType) continue;
          const fileName = safeFileName(row.idDocOriginalName);
          push({
            kind: "employees",
            relativePath: row.idDocRelativePath,
            zipPath: `employees/${row.id}/${fileName}`,
            originalFileName: row.idDocOriginalName,
            mimeType: row.idDocMimeType,
            entityType: "employee_id_document",
            entityId: row.id,
          });
        }
        break;
      }
      case "expenses": {
        const rows = await prisma.expense.findMany({
          where: { tenantId },
          select: {
            id: true,
            proofRelativePath: true,
            proofOriginalName: true,
            proofMimeType: true,
          },
        });
        for (const row of rows) {
          if (!row.proofRelativePath || !row.proofOriginalName || !row.proofMimeType) continue;
          const fileName = safeFileName(row.proofOriginalName);
          push({
            kind: "expenses",
            relativePath: row.proofRelativePath,
            zipPath: `expenses/${row.id}/${fileName}`,
            originalFileName: row.proofOriginalName,
            mimeType: row.proofMimeType,
            entityType: "expense_proof",
            entityId: row.id,
          });
        }
        break;
      }
      case "operation_documents": {
        const rows = await prisma.operationDocument.findMany({
          where: { tenantId },
          select: {
            id: true,
            operationId: true,
            relativePath: true,
            originalFileName: true,
            mimeType: true,
          },
        });
        for (const row of rows) {
          const fileName = safeFileName(row.originalFileName);
          push({
            kind: "operations",
            relativePath: row.relativePath,
            zipPath: `operations/${row.operationId}/${row.id}-${fileName}`,
            originalFileName: row.originalFileName,
            mimeType: row.mimeType,
            entityType: "operation_document",
            entityId: row.id,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { entries, selectedEntities: exportKeys };
}

export async function createTenantDocumentsArchive(
  prisma: PrismaService,
  uploads: UploadBlobStorage,
  tenantId: string,
  requestedTables: string[] | undefined,
  opts: { allowFeatureFlags: boolean },
): Promise<ZipArchive> {
  const { entries, selectedEntities } = await collectTenantDocumentEntries(prisma, tenantId, requestedTables, opts);
  const manifest: TenantDocumentManifest = {
    tenantId,
    exportedAt: new Date().toISOString(),
    selectedEntities,
    files: [],
    skipped: [],
  };

  const archive = new ZipArchive({ zlib: { level: 9 } });

  for (const entry of entries) {
    try {
      await uploads.assertExists(entry.kind, entry.relativePath);
      const body = await readUploadBuffer(uploads, entry.kind, entry.relativePath);
      archive.append(body, { name: entry.zipPath });
      manifest.files.push({
        zipPath: entry.zipPath,
        originalFileName: entry.originalFileName,
        mimeType: entry.mimeType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        storageKind: entry.kind,
        relativePath: entry.relativePath,
      });
    } catch {
      manifest.skipped.push({ zipPath: entry.zipPath, reason: "not_found_in_storage" });
    }
  }

  if (manifest.files.length === 0 && manifest.skipped.length === 0) {
    archive.append(
      "No uploaded documents were found for the selected entities in this organization.\n",
      { name: "README.txt" },
    );
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  void archive.finalize();
  return archive;
}
