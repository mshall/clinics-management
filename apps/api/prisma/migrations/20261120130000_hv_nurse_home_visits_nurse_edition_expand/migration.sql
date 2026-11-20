-- CreateEnum
CREATE TYPE "ServiceLocation" AS ENUM ('IN_CLINIC', 'HOME');

-- CreateEnum
CREATE TYPE "OrganizationEdition" AS ENUM ('CLINIC', 'NURSE');

-- CreateEnum
CREATE TYPE "HomeVisitState" AS ENUM ('REQUESTED', 'CONFIRMED', 'ON_MY_WAY', 'ARRIVED', 'FINISHED', 'ABORTED_UNSAFE', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HomeSafetyAlertKind" AS ENUM ('NO_ANSWER', 'SOS', 'UNSAFE_ABORT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlanKey" ADD VALUE 'NURSE_LITE';
ALTER TYPE "PlanKey" ADD VALUE 'NURSE_PRO';
ALTER TYPE "PlanKey" ADD VALUE 'NURSE_AGENCY';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "homeSurchargeAmount" DECIMAL(14,2),
ADD COLUMN     "serviceLocation" "ServiceLocation" NOT NULL DEFAULT 'IN_CLINIC';

-- AlterTable
ALTER TABLE "AppointmentType" ADD COLUMN     "homeSurchargeAmount" DECIMAL(14,2),
ADD COLUMN     "serviceLocation" "ServiceLocation" NOT NULL DEFAULT 'IN_CLINIC';

-- AlterTable
ALTER TABLE "SlotHold" ADD COLUMN     "visitAddressCiphertext" TEXT,
ADD COLUMN     "visitDistrict" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "edition" "OrganizationEdition" NOT NULL DEFAULT 'CLINIC',
ADD COLUMN     "nurseTenantKind" TEXT,
ADD COLUMN     "safetyContactName" TEXT,
ADD COLUMN     "safetyContactPhone" TEXT;

-- CreateTable
CREATE TABLE "ClinicianHomeSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "acceptsHomeVisits" BOOLEAN NOT NULL DEFAULT true,
    "coverageDistrictIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxTravelMinutes" INTEGER,
    "startDistrictId" TEXT,
    "dailyVisitCap" INTEGER,
    "homeHoursJson" JSONB,
    "restrictToPatientGender" "Gender",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicianHomeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "state" "HomeVisitState" NOT NULL DEFAULT 'REQUESTED',
    "districtId" TEXT NOT NULL,
    "addressCiphertext" TEXT,
    "addressMaskedAt" TIMESTAMP(3),
    "addressConfirmedAt" TIMESTAMP(3),
    "plannedStartsAt" TIMESTAMP(3) NOT NULL,
    "plannedEndsAt" TIMESTAMP(3) NOT NULL,
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "abortReason" TEXT,
    "surchargeAmount" DECIMAL(14,2),
    "safetyPromptSentAt" TIMESTAMP(3),
    "safetyAnsweredAt" TIMESTAMP(3),
    "safetyAlertSentAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeVisitGeostamp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "districtId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "HomeVisitGeostamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeSafetyAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "kind" "HomeSafetyAlertKind" NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deliveryChannel" TEXT,
    "latencyMs" INTEGER,
    "withinSla" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeSafetyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurseRosterProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payPerVisit" DECIMAL(14,2),
    "payPerShiftHour" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NurseRosterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "nurseId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "visitsTotal" INTEGER NOT NULL DEFAULT 0,
    "visitsDone" INTEGER NOT NULL DEFAULT 0,
    "servicePackageId" TEXT,
    "endedAt" TIMESTAMP(3),
    "dischargeNote" TEXT,
    "sharedToVaultAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanVisit" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "carePlanId" TEXT,
    "checklistJson" JSONB NOT NULL DEFAULT '[]',
    "assessment" TEXT,
    "intervention" TEXT,
    "evaluation" TEXT,
    "freeText" TEXT,
    "medicationFreeText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalsObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitRecordId" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "temperatureC" DECIMAL(4,1),
    "spo2" INTEGER,
    "respiratoryRate" INTEGER,
    "glucoseMgDl" INTEGER,
    "painScore" INTEGER,
    "flagsJson" JSONB NOT NULL DEFAULT '{}',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "escalationAction" TEXT,
    "escalationNote" TEXT,
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "VitalsObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prescriberName" TEXT NOT NULL,
    "orderedOn" DATE NOT NULL,
    "expiresOn" DATE NOT NULL,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "linesJson" JSONB NOT NULL,
    "documentKey" TEXT,
    "externalRef" TEXT,
    "orderVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "confirmedByNurseId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAdministration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitRecordId" TEXT,
    "doctorOrderId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "drugProductId" TEXT,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "nurseId" TEXT NOT NULL,
    "witnessUserId" TEXT,
    "witnessName" TEXT,
    "safetyCheckJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "handoverNote" TEXT,
    "handoverToNurseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicianHomeSettings_tenantId_clinicianId_key" ON "ClinicianHomeSettings"("tenantId", "clinicianId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeVisit_appointmentId_key" ON "HomeVisit"("appointmentId");

-- CreateIndex
CREATE INDEX "HomeVisit_tenantId_clinicianId_plannedStartsAt_idx" ON "HomeVisit"("tenantId", "clinicianId", "plannedStartsAt");

-- CreateIndex
CREATE INDEX "HomeVisit_tenantId_state_idx" ON "HomeVisit"("tenantId", "state");

-- CreateIndex
CREATE INDEX "HomeVisit_endedAt_addressMaskedAt_idx" ON "HomeVisit"("endedAt", "addressMaskedAt");

-- CreateIndex
CREATE INDEX "HomeVisitGeostamp_tenantId_recordedAt_idx" ON "HomeVisitGeostamp"("tenantId", "recordedAt");

-- CreateIndex
CREATE INDEX "HomeVisitGeostamp_visitId_idx" ON "HomeVisitGeostamp"("visitId");

-- CreateIndex
CREATE INDEX "HomeVisitGeostamp_purgedAt_recordedAt_idx" ON "HomeVisitGeostamp"("purgedAt", "recordedAt");

-- CreateIndex
CREATE INDEX "HomeSafetyAlert_tenantId_status_raisedAt_idx" ON "HomeSafetyAlert"("tenantId", "status", "raisedAt");

-- CreateIndex
CREATE INDEX "HomeSafetyAlert_visitId_idx" ON "HomeSafetyAlert"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "NurseRosterProfile_tenantId_userId_key" ON "NurseRosterProfile"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CarePlan_tenantId_patientId_idx" ON "CarePlan"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "CarePlan_tenantId_status_idx" ON "CarePlan"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CarePlanVisit_appointmentId_key" ON "CarePlanVisit"("appointmentId");

-- CreateIndex
CREATE INDEX "CarePlanVisit_carePlanId_idx" ON "CarePlanVisit"("carePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitRecord_appointmentId_key" ON "VisitRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "VisitRecord_tenantId_patientId_idx" ON "VisitRecord"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "VisitRecord_tenantId_nurseId_idx" ON "VisitRecord"("tenantId", "nurseId");

-- CreateIndex
CREATE INDEX "VitalsObservation_tenantId_patientId_recordedAt_idx" ON "VitalsObservation"("tenantId", "patientId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorOrder_externalRef_key" ON "DoctorOrder"("externalRef");

-- CreateIndex
CREATE INDEX "DoctorOrder_tenantId_patientId_idx" ON "DoctorOrder"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "MedicationAdministration_tenantId_patientId_administeredAt_idx" ON "MedicationAdministration"("tenantId", "patientId", "administeredAt");

-- CreateIndex
CREATE INDEX "MedicationAdministration_doctorOrderId_idx" ON "MedicationAdministration"("doctorOrderId");

-- CreateIndex
CREATE INDEX "ShiftBooking_tenantId_nurseId_startsAt_idx" ON "ShiftBooking"("tenantId", "nurseId", "startsAt");

-- CreateIndex
CREATE INDEX "ShiftBooking_tenantId_patientId_idx" ON "ShiftBooking"("tenantId", "patientId");

-- AddForeignKey
ALTER TABLE "ClinicianHomeSettings" ADD CONSTRAINT "ClinicianHomeSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeVisit" ADD CONSTRAINT "HomeVisit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeVisit" ADD CONSTRAINT "HomeVisit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeVisitGeostamp" ADD CONSTRAINT "HomeVisitGeostamp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeVisitGeostamp" ADD CONSTRAINT "HomeVisitGeostamp_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "HomeVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSafetyAlert" ADD CONSTRAINT "HomeSafetyAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSafetyAlert" ADD CONSTRAINT "HomeSafetyAlert_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "HomeVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurseRosterProfile" ADD CONSTRAINT "NurseRosterProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanVisit" ADD CONSTRAINT "CarePlanVisit_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalsObservation" ADD CONSTRAINT "VitalsObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalsObservation" ADD CONSTRAINT "VitalsObservation_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorOrder" ADD CONSTRAINT "DoctorOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_doctorOrderId_fkey" FOREIGN KEY ("doctorOrderId") REFERENCES "DoctorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftBooking" ADD CONSTRAINT "ShiftBooking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

