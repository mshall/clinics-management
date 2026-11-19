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

CREATE TABLE IF NOT EXISTS "TenantOffboarding" (
    "tenantId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "retentionEndsAt" TIMESTAMP(3),
    "deletionScheduledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "noticeSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantOffboarding_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "TenantOffboarding" ADD CONSTRAINT "TenantOffboarding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
