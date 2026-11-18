-- ON-05: spreadsheet import jobs + IMPORT acquisition channel
CREATE TYPE "ImportEntity" AS ENUM ('PATIENTS', 'APPOINTMENTS', 'PRICE_LIST', 'STAFF');

CREATE TYPE "ImportJobStatus" AS ENUM ('VALIDATING', 'READY', 'COMMITTING', 'DONE', 'FAILED', 'UNDONE');

ALTER TYPE "PatientAcquisitionChannel" ADD VALUE 'IMPORT';

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" "ImportEntity" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "status" "ImportJobStatus" NOT NULL DEFAULT 'VALIDATING',
    "dedupeMode" TEXT NOT NULL DEFAULT 'SKIP',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "okRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "mergedRows" INTEGER NOT NULL DEFAULT 0,
    "rowsJson" JSONB,
    "errorsJson" JSONB,
    "createdIdsJson" JSONB,
    "reportKey" TEXT,
    "failureMessage" TEXT,
    "createdBy" TEXT NOT NULL,
    "actingRepUserId" TEXT,
    "committedAt" TIMESTAMP(3),
    "undoUntil" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_tenantId_createdAt_idx" ON "ImportJob"("tenantId", "createdAt");

ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
