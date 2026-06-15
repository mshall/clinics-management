-- CreateEnum
CREATE TYPE "PatientAcquisitionChannel" AS ENUM (
  'SOCIAL_FACEBOOK',
  'SOCIAL_INSTAGRAM',
  'SOCIAL_TIKTOK',
  'WEBSITE_GOOGLE',
  'DOCTOR_REFERRAL',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "acquisitionChannel" "PatientAcquisitionChannel";
ALTER TABLE "Patient" ADD COLUMN "acquisitionReferralName" TEXT;
ALTER TABLE "Patient" ADD COLUMN "acquisitionOtherDetail" TEXT;

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "relativePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientDocument_tenantId_idx" ON "PatientDocument"("tenantId");
CREATE INDEX "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
