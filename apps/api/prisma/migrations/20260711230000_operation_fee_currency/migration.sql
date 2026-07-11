-- AlterTable
ALTER TABLE "Operation" ADD COLUMN "feeCurrency" TEXT NOT NULL DEFAULT 'AED';

-- Backfill from clinic default currency
UPDATE "Operation" o
SET "feeCurrency" = c."defaultCurrency"
FROM "Clinic" c
WHERE c."id" = o."clinicId";
