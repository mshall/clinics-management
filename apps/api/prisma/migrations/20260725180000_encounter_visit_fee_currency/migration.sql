-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN "visitFeeCurrency" TEXT NOT NULL DEFAULT 'AED';

-- Backfill from clinic default currency
UPDATE "Encounter" e
SET "visitFeeCurrency" = c."defaultCurrency"
FROM "Clinic" c
WHERE c."id" = e."clinicId";
