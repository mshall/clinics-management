-- AlterEnum
ALTER TYPE "ClinicalSpecialty" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "ClinicalFormTemplate" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customSpecialtyLabelEn" TEXT,
ADD COLUMN     "customSpecialtyLabelAr" TEXT;

-- CreateIndex
CREATE INDEX "ClinicalFormTemplate_tenantId_clinicId_idx" ON "ClinicalFormTemplate"("tenantId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormTemplate_tenantId_specialty_system_default_key" ON "ClinicalFormTemplate"("tenantId", "specialty") WHERE "isSystemDefault" = true AND "clinicId" IS NULL;

-- AddForeignKey
ALTER TABLE "ClinicalFormTemplate" ADD CONSTRAINT "ClinicalFormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;