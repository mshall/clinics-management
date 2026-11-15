-- CreateEnum
CREATE TYPE "MarketOperationalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "operationalStatus" "MarketOperationalStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "pausedUntil" TIMESTAMP(3),
ADD COLUMN     "lastProvisionNote" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "defaultLicenseNumber" TEXT;

-- Bind demo org + backfill when Egypt market exists
UPDATE "Tenant" t
SET "marketId" = m.id,
    "deploymentCell" = COALESCE(t."deploymentCell", m."hostCell")
FROM "Market" m
WHERE m."code" = 'EG' AND t."marketId" IS NULL
  AND (t."name" ILIKE '%Dr Ahmed%' OR t."name" ILIKE '%Dr. Ahmed%' OR t."name" = 'Dr Ahmed El Shall Group');