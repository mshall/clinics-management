-- CreateEnum
CREATE TYPE "PatientAllergyCode" AS ENUM ('PENICILLIN', 'AMOXICILLIN', 'SULFA', 'ASPIRIN', 'NSAIDS', 'LATEX', 'PEANUTS', 'TREE_NUTS', 'SHELLFISH', 'EGGS', 'MILK', 'SOY', 'WHEAT', 'BEE_STING', 'CONTRAST_IODINE', 'CODEINE', 'MORPHINE', 'OTHER');

-- CreateTable
CREATE TABLE "PatientAllergy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "code" "PatientAllergyCode" NOT NULL,
    "otherComment" TEXT,
    "encounterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientAllergy_tenantId_idx" ON "PatientAllergy"("tenantId");

-- CreateIndex
CREATE INDEX "PatientAllergy_patientId_idx" ON "PatientAllergy"("patientId");

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
