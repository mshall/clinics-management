-- COM-1: Kiorex commission collection mirror (provider-side transparency). Additive and idempotent.
ALTER TABLE "KiorexPayout" ADD COLUMN IF NOT EXISTS "commissionDeducted" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "KiorexCommissionCollection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runRef" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "modeRequested" TEXT,
    "fallbackReason" TEXT,
    "provider" TEXT,
    "currency" TEXT NOT NULL,
    "claimsCount" INTEGER NOT NULL,
    "claimsMinor" INTEGER NOT NULL,
    "collectedMinor" INTEGER NOT NULL DEFAULT 0,
    "deductedMinor" INTEGER NOT NULL DEFAULT 0,
    "invoicedMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "invoiceDueAt" TIMESTAMP(3),
    "cutoffAt" TIMESTAMP(3),
    "collectAt" TIMESTAMP(3),
    "version" BIGINT NOT NULL,
    "claims" JSONB NOT NULL DEFAULT '[]',
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KiorexCommissionCollection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KiorexCommissionCollection_tenantId_runRef_key" ON "KiorexCommissionCollection"("tenantId", "runRef");
CREATE INDEX IF NOT EXISTS "KiorexCommissionCollection_tenantId_periodKey_idx" ON "KiorexCommissionCollection"("tenantId", "periodKey");
DO $$ BEGIN
  ALTER TABLE "KiorexCommissionCollection" ADD CONSTRAINT "KiorexCommissionCollection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
