-- Additive: document quality processing (storage quality pipeline). Safe for live tenants (Dr Ahmed Shall):
-- nullable columns only; existing blobs unchanged until a job runs; flag off = no processing.

-- Tenant opt-in / originals
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "storageQualityPipelineEnabled" BOOLEAN;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "keepOriginalUploads" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "storageQualityShadowUntil" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "storageBytesUsed" BIGINT NOT NULL DEFAULT 0;

-- PatientDocument
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "originalSizeBytes" INTEGER;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "thumbSmallRelativePath" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "thumbLargeRelativePath" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "originalRelativePath" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "processingError" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "qualityNote" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "ssim" DOUBLE PRECISION;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "qualityUsed" INTEGER;
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "longEdgeUsed" INTEGER;
CREATE INDEX IF NOT EXISTS "PatientDocument_tenantId_processingStatus_idx" ON "PatientDocument"("tenantId", "processingStatus");
CREATE INDEX IF NOT EXISTS "PatientDocument_tenantId_sha256_idx" ON "PatientDocument"("tenantId", "sha256");

-- EncounterDocument
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "originalSizeBytes" INTEGER;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "thumbSmallRelativePath" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "thumbLargeRelativePath" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "originalRelativePath" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "processingError" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "qualityNote" TEXT;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "ssim" DOUBLE PRECISION;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "qualityUsed" INTEGER;
ALTER TABLE "EncounterDocument" ADD COLUMN IF NOT EXISTS "longEdgeUsed" INTEGER;
CREATE INDEX IF NOT EXISTS "EncounterDocument_tenantId_processingStatus_idx" ON "EncounterDocument"("tenantId", "processingStatus");
CREATE INDEX IF NOT EXISTS "EncounterDocument_tenantId_sha256_idx" ON "EncounterDocument"("tenantId", "sha256");

-- OperationDocument
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "originalSizeBytes" INTEGER;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "thumbSmallRelativePath" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "thumbLargeRelativePath" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "originalRelativePath" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "processingError" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "qualityNote" TEXT;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "ssim" DOUBLE PRECISION;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "qualityUsed" INTEGER;
ALTER TABLE "OperationDocument" ADD COLUMN IF NOT EXISTS "longEdgeUsed" INTEGER;
CREATE INDEX IF NOT EXISTS "OperationDocument_tenantId_processingStatus_idx" ON "OperationDocument"("tenantId", "processingStatus");
CREATE INDEX IF NOT EXISTS "OperationDocument_tenantId_sha256_idx" ON "OperationDocument"("tenantId", "sha256");

-- PatientClinicalPhoto
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "originalSizeBytes" INTEGER;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "thumbSmallRelativePath" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "thumbLargeRelativePath" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "originalRelativePath" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "processingError" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "qualityNote" TEXT;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "ssim" DOUBLE PRECISION;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "qualityUsed" INTEGER;
ALTER TABLE "PatientClinicalPhoto" ADD COLUMN IF NOT EXISTS "longEdgeUsed" INTEGER;
CREATE INDEX IF NOT EXISTS "PatientClinicalPhoto_tenantId_processingStatus_idx" ON "PatientClinicalPhoto"("tenantId", "processingStatus");
CREATE INDEX IF NOT EXISTS "PatientClinicalPhoto_tenantId_sha256_idx" ON "PatientClinicalPhoto"("tenantId", "sha256");

-- Work queue (SKIP LOCKED workers)
CREATE TABLE IF NOT EXISTS "StorageJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refModel" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorageJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StorageJob_status_runAfter_idx" ON "StorageJob"("status", "runAfter");
CREATE INDEX IF NOT EXISTS "StorageJob_tenantId_idx" ON "StorageJob"("tenantId");
DO $$ BEGIN
  ALTER TABLE "StorageJob" ADD CONSTRAINT "StorageJob_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
