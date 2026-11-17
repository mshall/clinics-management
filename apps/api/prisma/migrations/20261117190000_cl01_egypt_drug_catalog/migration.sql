-- CL-01: Egyptian drug catalog (brand → active ingredient)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "ActiveIngredient" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "atcCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActiveIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActiveIngredient_nameEn_key" ON "ActiveIngredient"("nameEn");

CREATE TABLE "DrugDatasetVersion" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceLicense" TEXT NOT NULL DEFAULT '',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DrugDatasetVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrugDatasetVersion_marketId_isActive_idx" ON "DrugDatasetVersion"("marketId", "isActive");
CREATE UNIQUE INDEX "DrugDatasetVersion_marketId_versionLabel_key" ON "DrugDatasetVersion"("marketId", "versionLabel");

CREATE TABLE "DrugProduct" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "brandNameEn" TEXT NOT NULL,
    "brandNameAr" TEXT,
    "form" TEXT NOT NULL,
    "strength" TEXT,
    "pack" TEXT,
    "manufacturer" TEXT,
    "registrationNo" TEXT,
    "defaultSigEn" TEXT,
    "defaultSigAr" TEXT,
    "instructionPhrases" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrugProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrugProduct_marketId_brandNameEn_idx" ON "DrugProduct"("marketId", "brandNameEn");
CREATE INDEX "DrugProduct_marketId_isActive_idx" ON "DrugProduct"("marketId", "isActive");
CREATE INDEX "DrugProduct_brandNameEn_trgm_idx" ON "DrugProduct" USING gin (lower("brandNameEn") gin_trgm_ops);
CREATE INDEX "DrugProduct_brandNameAr_trgm_idx" ON "DrugProduct" USING gin (lower("brandNameAr") gin_trgm_ops);

CREATE TABLE "DrugProductIngredient" (
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "strength" TEXT,
    CONSTRAINT "DrugProductIngredient_pkey" PRIMARY KEY ("productId","ingredientId")
);

CREATE TABLE "ClinicianDrugProductUsage" (
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "drugProductId" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicianDrugProductUsage_pkey" PRIMARY KEY ("tenantId","clinicianId","drugProductId")
);

CREATE INDEX "ClinicianDrugProductUsage_tenantId_clinicianId_useCount_idx" ON "ClinicianDrugProductUsage"("tenantId", "clinicianId", "useCount");

ALTER TABLE "DrugDatasetVersion" ADD CONSTRAINT "DrugDatasetVersion_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugProduct" ADD CONSTRAINT "DrugProduct_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugProduct" ADD CONSTRAINT "DrugProduct_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DrugDatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugProductIngredient" ADD CONSTRAINT "DrugProductIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DrugProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugProductIngredient" ADD CONSTRAINT "DrugProductIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ActiveIngredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicianDrugProductUsage" ADD CONSTRAINT "ClinicianDrugProductUsage_drugProductId_fkey" FOREIGN KEY ("drugProductId") REFERENCES "DrugProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncounterMedication" ADD COLUMN "drugProductId" TEXT;
ALTER TABLE "EncounterMedication" ADD COLUMN "drugUnverified" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "EncounterMedication_drugProductId_idx" ON "EncounterMedication"("drugProductId");
ALTER TABLE "EncounterMedication" ADD CONSTRAINT "EncounterMedication_drugProductId_fkey" FOREIGN KEY ("drugProductId") REFERENCES "DrugProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;