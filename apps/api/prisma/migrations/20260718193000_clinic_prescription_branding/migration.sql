ALTER TABLE "Clinic" ADD COLUMN "prescriptionLogoRelativePath" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "prescriptionLogoOriginalName" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "prescriptionLogoMimeType" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "prescriptionHeaderDescriptionEn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN "prescriptionHeaderDescriptionAr" TEXT NOT NULL DEFAULT '';
