-- Fiscal receipt chain per POS device (ETA previousUUID), submission device binding.

ALTER TABLE "FiscalSubmission" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

CREATE TABLE IF NOT EXISTS "FiscalPosChain" (
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastAcceptedUuid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalPosChain_pkey" PRIMARY KEY ("tenantId","clinicId","providerKey","deviceId")
);

CREATE INDEX IF NOT EXISTS "FiscalSubmission_tenantId_clinicId_providerKey_deviceId_status_createdAt_idx"
ON "FiscalSubmission" ("tenantId", "clinicId", "providerKey", "deviceId", "status", "createdAt");