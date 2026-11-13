-- CreateEnum
CREATE TYPE "ClinicalLetterType" AS ENUM ('SICK_LEAVE', 'MEDICAL_REPORT', 'REFERRAL', 'FITNESS_CERTIFICATE');
CREATE TYPE "ClinicalShortcutType" AS ENUM ('TEXT_EXPAND', 'DIAGNOSIS_FAV', 'RX_SET', 'COPY_LAST_VISIT');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "encounterAutoLockHours" INTEGER NOT NULL DEFAULT 72;

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN "clinicalTemplateId" TEXT,
ADD COLUMN "specialtyFormResponses" JSONB,
ADD COLUMN "noteLockedAt" TIMESTAMP(3),
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedByUserId" TEXT,
ADD COLUMN "amendReason" TEXT,
ADD COLUMN "amendedByUserId" TEXT,
ADD COLUMN "amendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClinicalFormTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "specialty" "ClinicalSpecialty" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sectionsJson" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalFormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicianShortcut" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ClinicalShortcutType" NOT NULL,
    "label" TEXT NOT NULL,
    "trigger" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicianShortcut_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicianDiagnosisFavorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicianDiagnosisFavorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Icd10Entry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "icd10Code" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Icd10Entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrugInteractionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "drugA" TEXT NOT NULL,
    "drugB" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "messageEn" TEXT NOT NULL,
    "messageAr" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrugInteractionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT,
    "patientId" TEXT NOT NULL,
    "type" "ClinicalLetterType" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL DEFAULT '',
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalFormTemplate_tenantId_specialty_idx" ON "ClinicalFormTemplate"("tenantId", "specialty");
CREATE INDEX "ClinicalFormTemplate_tenantId_ownerUserId_idx" ON "ClinicalFormTemplate"("tenantId", "ownerUserId");
CREATE INDEX "ClinicianShortcut_tenantId_userId_type_idx" ON "ClinicianShortcut"("tenantId", "userId", "type");
CREATE UNIQUE INDEX "ClinicianDiagnosisFavorite_tenantId_userId_icd10Code_key" ON "ClinicianDiagnosisFavorite"("tenantId", "userId", "icd10Code");
CREATE INDEX "ClinicianDiagnosisFavorite_tenantId_userId_idx" ON "ClinicianDiagnosisFavorite"("tenantId", "userId");
CREATE INDEX "Icd10Entry_tenantId_idx" ON "Icd10Entry"("tenantId");
CREATE INDEX "Icd10Entry_icd10Code_idx" ON "Icd10Entry"("icd10Code");
CREATE INDEX "DrugInteractionRule_tenantId_idx" ON "DrugInteractionRule"("tenantId");
CREATE INDEX "ClinicalLetter_tenantId_patientId_idx" ON "ClinicalLetter"("tenantId", "patientId");
CREATE INDEX "ClinicalLetter_encounterId_idx" ON "ClinicalLetter"("encounterId");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicalTemplateId_fkey" FOREIGN KEY ("clinicalTemplateId") REFERENCES "ClinicalFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_amendedByUserId_fkey" FOREIGN KEY ("amendedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalFormTemplate" ADD CONSTRAINT "ClinicalFormTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalFormTemplate" ADD CONSTRAINT "ClinicalFormTemplate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicianShortcut" ADD CONSTRAINT "ClinicianShortcut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianShortcut" ADD CONSTRAINT "ClinicianShortcut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianDiagnosisFavorite" ADD CONSTRAINT "ClinicianDiagnosisFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianDiagnosisFavorite" ADD CONSTRAINT "ClinicianDiagnosisFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Icd10Entry" ADD CONSTRAINT "Icd10Entry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugInteractionRule" ADD CONSTRAINT "DrugInteractionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalLetter" ADD CONSTRAINT "ClinicalLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalLetter" ADD CONSTRAINT "ClinicalLetter_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalLetter" ADD CONSTRAINT "ClinicalLetter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
