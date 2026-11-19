-- Org export progress columns. On a fresh DB this runs *before*
-- 20261119200000_sc05_tenant_exports, so create the base table if needed.
CREATE TABLE IF NOT EXISTS "TenantExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "patientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "downloadTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "artifactPath" TEXT,
    "error" TEXT,
    "rowCounts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TenantExportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantExportJob_downloadTokenHash_key" ON "TenantExportJob"("downloadTokenHash");
CREATE INDEX IF NOT EXISTS "TenantExportJob_tenantId_createdAt_idx" ON "TenantExportJob"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "TenantExportJob_status_createdAt_idx" ON "TenantExportJob"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantExportJob_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantExportJob"
      ADD CONSTRAINT "TenantExportJob_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "TenantExportJob" ADD COLUMN IF NOT EXISTS "contentType" TEXT;
ALTER TABLE "TenantExportJob" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "TenantExportJob" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantExportJob" ADD COLUMN IF NOT EXISTS "tablesJson" JSONB;
