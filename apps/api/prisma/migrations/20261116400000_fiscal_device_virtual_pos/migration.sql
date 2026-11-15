-- CreateEnum
CREATE TYPE "FiscalDeviceKind" AS ENUM ('VIRTUAL', 'PHYSICAL');
CREATE TYPE "FiscalDeviceStatus" AS ENUM ('PENDING_REGISTRATION', 'CREDENTIALS_PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'CREDENTIALS_EXPIRED');

-- CreateTable
CREATE TABLE "FiscalDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "kind" "FiscalDeviceKind" NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "label" TEXT,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "status" "FiscalDeviceStatus" NOT NULL DEFAULT 'CREDENTIALS_PENDING',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "credentialId" TEXT,
    "lastReceiptUuid" TEXT,
    "receiptSequence" INTEGER NOT NULL DEFAULT 0,
    "lastSubmittedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalDevice_credentialId_key" ON "FiscalDevice"("credentialId");
CREATE UNIQUE INDEX "FiscalDevice_tenantId_providerKey_serialNumber_key" ON "FiscalDevice"("tenantId", "providerKey", "serialNumber");
CREATE INDEX "FiscalDevice_tenantId_clinicId_providerKey_idx" ON "FiscalDevice"("tenantId", "clinicId", "providerKey");
CREATE INDEX "FiscalDevice_tenantId_clinicId_providerKey_isDefault_idx" ON "FiscalDevice"("tenantId", "clinicId", "providerKey", "isDefault");

ALTER TABLE "FiscalDevice" ADD CONSTRAINT "FiscalDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDevice" ADD CONSTRAINT "FiscalDevice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDevice" ADD CONSTRAINT "FiscalDevice_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ProviderCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FiscalDocument" ADD COLUMN "fiscalDeviceId" TEXT;
ALTER TABLE "FiscalSubmission" ADD COLUMN "fiscalDeviceId" TEXT;
ALTER TABLE "FiscalSubmission" ADD COLUMN "receiptNumber" INTEGER;

ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_fiscalDeviceId_fkey" FOREIGN KEY ("fiscalDeviceId") REFERENCES "FiscalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscalSubmission" ADD CONSTRAINT "FiscalSubmission_fiscalDeviceId_fkey" FOREIGN KEY ("fiscalDeviceId") REFERENCES "FiscalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FiscalSubmission_fiscalDeviceId_status_createdAt_idx" ON "FiscalSubmission"("fiscalDeviceId", "status", "createdAt");

-- Backfill virtual devices for clinics with eta provider settings or credentials
INSERT INTO "FiscalDevice" (
  "id", "tenantId", "clinicId", "providerKey", "kind", "serialNumber", "label", "status", "isDefault",
  "credentialId", "lastReceiptUuid", "receiptSequence", "activatedAt", "createdAt", "updatedAt"
)
SELECT
  'fd_' || src."clinicId",
  src."tenantId",
  src."clinicId",
  'eta-egypt',
  'VIRTUAL'::"FiscalDeviceKind",
  src."serialNumber",
  'Kiorly virtual POS',
  src."status",
  true,
  src."credentialId",
  src."lastAcceptedUuid",
  0,
  src."activatedAt",
  NOW(),
  NOW()
FROM (
  SELECT
    c."id" AS "clinicId",
    c."tenantId",
    upper(substring(regexp_replace(
      'KIORLY-EG-' || upper(substring(regexp_replace(c."id", '[^A-Za-z0-9]', '', 'g'), 1, 6)) || '-' ||
      lpad((row_number() OVER (PARTITION BY c."tenantId" ORDER BY c."createdAt"))::text, 2, '0'),
      '[^A-Z0-9-]', '', 'g'), 1, 30)) AS "serialNumber",
    CASE WHEN pc."id" IS NOT NULL THEN 'ACTIVE'::"FiscalDeviceStatus" ELSE 'CREDENTIALS_PENDING'::"FiscalDeviceStatus" END AS "status",
    pc."id" AS "credentialId",
    fpc."lastAcceptedUuid",
    CASE WHEN pc."id" IS NOT NULL THEN NOW() ELSE NULL END AS "activatedAt"
  FROM "Clinic" c
  LEFT JOIN LATERAL (
    SELECT id, "deviceId"
    FROM "ProviderCredential"
    WHERE "tenantId" = c."tenantId" AND "clinicId" = c."id" AND "providerKey" = 'eta-egypt'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT "lastAcceptedUuid"
    FROM "FiscalPosChain" fpc
    WHERE fpc."tenantId" = c."tenantId" AND fpc."clinicId" = c."id" AND fpc."providerKey" = 'eta-egypt'
    ORDER BY fpc."updatedAt" DESC NULLS LAST
    LIMIT 1
  ) fpc ON true
  WHERE (
    COALESCE(c."providerSettings"::jsonb -> 'eta-egypt', 'null'::jsonb) <> 'null'::jsonb
    OR pc."id" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "FiscalDevice" fd WHERE fd."clinicId" = c."id" AND fd."providerKey" = 'eta-egypt'
  )
) src;

UPDATE "FiscalDocument" d
SET "fiscalDeviceId" = fd."id"
FROM "FiscalDevice" fd
WHERE fd."clinicId" = d."clinicId" AND fd."providerKey" = d."providerKey" AND fd."isDefault" = true
  AND d."fiscalDeviceId" IS NULL;

UPDATE "FiscalSubmission" s
SET "fiscalDeviceId" = fd."id"
FROM "FiscalDevice" fd
WHERE fd."clinicId" = s."clinicId" AND fd."providerKey" = s."providerKey" AND fd."isDefault" = true
  AND s."fiscalDeviceId" IS NULL;