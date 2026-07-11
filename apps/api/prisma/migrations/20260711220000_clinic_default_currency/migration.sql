-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'AED';

-- Backfill from tenant base currency
UPDATE "Clinic" c
SET "defaultCurrency" = t."baseCurrency"
FROM "Tenant" t
WHERE t."id" = c."tenantId";
