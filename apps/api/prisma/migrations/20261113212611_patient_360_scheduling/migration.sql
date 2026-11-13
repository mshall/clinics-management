-- CreateEnum
CREATE TYPE "PatientActiveProblemStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PatientFamilyRelation" AS ENUM ('PARENT', 'CHILD', 'SPOUSE', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalPhotoKind" AS ENUM ('BEFORE', 'AFTER', 'GENERAL');

-- CreateEnum
CREATE TYPE "EncounterFollowUpStatus" AS ENUM ('NONE', 'PENDING_BOOKING', 'REMINDER_SENT', 'BOOKED');

-- CreateEnum
CREATE TYPE "AppointmentWaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'BOOKED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

-- DropIndex
DROP INDEX "Operation_tenantId_status_operationDate_idx";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "allowDoubleBook" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appointmentTypeId" TEXT,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "recurrenceIndex" INTEGER,
ADD COLUMN     "roomLabel" TEXT,
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "followUpDueAt" TIMESTAMP(3),
ADD COLUMN     "followUpNote" TEXT,
ADD COLUMN     "followUpStatus" "EncounterFollowUpStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "followUpWeeks" INTEGER;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "noShowCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiresAppointmentDeposit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PatientActiveProblem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "icd10Code" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "status" "PatientActiveProblemStatus" NOT NULL DEFAULT 'ACTIVE',
    "onsetDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "encounterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientActiveProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientFamilyLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromPatientId" TEXT NOT NULL,
    "toPatientId" TEXT NOT NULL,
    "relation" "PatientFamilyRelation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFamilyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientClinicalPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "ClinicalPhotoKind" NOT NULL DEFAULT 'GENERAL',
    "pairGroupId" TEXT,
    "caption" TEXT,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "relativePath" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientClinicalPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL DEFAULT 15,
    "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "colorHex" TEXT NOT NULL DEFAULT '#3b82f6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicianAvailabilityTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "weekJson" JSONB NOT NULL,
    "blockedJson" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicianAvailabilityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentSeries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "appointmentTypeId" TEXT,
    "label" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "completedSessions" INTEGER NOT NULL DEFAULT 0,
    "packagePaidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cadenceDays" INTEGER NOT NULL DEFAULT 7,
    "startsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentWaitlistEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "appointmentTypeId" TEXT,
    "preferredFrom" TIMESTAMP(3),
    "preferredTo" TIMESTAMP(3),
    "status" "AppointmentWaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offeredSlotAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientActiveProblem_tenantId_patientId_status_idx" ON "PatientActiveProblem"("tenantId", "patientId", "status");

-- CreateIndex
CREATE INDEX "PatientFamilyLink_tenantId_fromPatientId_idx" ON "PatientFamilyLink"("tenantId", "fromPatientId");

-- CreateIndex
CREATE INDEX "PatientFamilyLink_tenantId_toPatientId_idx" ON "PatientFamilyLink"("tenantId", "toPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientFamilyLink_tenantId_fromPatientId_toPatientId_relati_key" ON "PatientFamilyLink"("tenantId", "fromPatientId", "toPatientId", "relation");

-- CreateIndex
CREATE INDEX "PatientClinicalPhoto_tenantId_patientId_idx" ON "PatientClinicalPhoto"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PatientClinicalPhoto_tenantId_pairGroupId_idx" ON "PatientClinicalPhoto"("tenantId", "pairGroupId");

-- CreateIndex
CREATE INDEX "AppointmentType_tenantId_clinicId_idx" ON "AppointmentType"("tenantId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicianAvailabilityTemplate_tenantId_clinicId_clinicianId_key" ON "ClinicianAvailabilityTemplate"("tenantId", "clinicId", "clinicianId");

-- CreateIndex
CREATE INDEX "AppointmentSeries_tenantId_patientId_idx" ON "AppointmentSeries"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "AppointmentWaitlistEntry_tenantId_clinicId_status_idx" ON "AppointmentWaitlistEntry"("tenantId", "clinicId", "status");

-- CreateIndex
CREATE INDEX "AppointmentWaitlistEntry_patientId_idx" ON "AppointmentWaitlistEntry"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_seriesId_idx" ON "Appointment"("seriesId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_clinicianId_startsAt_idx" ON "Appointment"("tenantId", "clinicianId", "startsAt");

-- CreateIndex
CREATE INDEX "Encounter_tenantId_followUpStatus_followUpDueAt_idx" ON "Encounter"("tenantId", "followUpStatus", "followUpDueAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AppointmentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientActiveProblem" ADD CONSTRAINT "PatientActiveProblem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientActiveProblem" ADD CONSTRAINT "PatientActiveProblem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientActiveProblem" ADD CONSTRAINT "PatientActiveProblem_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFamilyLink" ADD CONSTRAINT "PatientFamilyLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFamilyLink" ADD CONSTRAINT "PatientFamilyLink_fromPatientId_fkey" FOREIGN KEY ("fromPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFamilyLink" ADD CONSTRAINT "PatientFamilyLink_toPatientId_fkey" FOREIGN KEY ("toPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalPhoto" ADD CONSTRAINT "PatientClinicalPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalPhoto" ADD CONSTRAINT "PatientClinicalPhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAvailabilityTemplate" ADD CONSTRAINT "ClinicianAvailabilityTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAvailabilityTemplate" ADD CONSTRAINT "ClinicianAvailabilityTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAvailabilityTemplate" ADD CONSTRAINT "ClinicianAvailabilityTemplate_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSeries" ADD CONSTRAINT "AppointmentSeries_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentWaitlistEntry" ADD CONSTRAINT "AppointmentWaitlistEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentWaitlistEntry" ADD CONSTRAINT "AppointmentWaitlistEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentWaitlistEntry" ADD CONSTRAINT "AppointmentWaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentWaitlistEntry" ADD CONSTRAINT "AppointmentWaitlistEntry_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentWaitlistEntry" ADD CONSTRAINT "AppointmentWaitlistEntry_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
