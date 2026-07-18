-- CreateEnum
CREATE TYPE "ClinicRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "recordStatus" "ClinicRecordStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Clinic" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClinicOperatingPeriod" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicOperatingPeriod_pkey" PRIMARY KEY ("id")
);

-- Backfill one open operating period per existing clinic
INSERT INTO "ClinicOperatingPeriod" ("id", "clinicId", "startDate", "endDate", "createdAt", "updatedAt")
SELECT
    'cop_' || substr(md5("Clinic"."id" || ':init'), 1, 24),
    "Clinic"."id",
    ("Clinic"."createdAt" AT TIME ZONE 'UTC')::date,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Clinic";

-- CreateIndex
CREATE INDEX "ClinicOperatingPeriod_clinicId_idx" ON "ClinicOperatingPeriod"("clinicId");
CREATE INDEX "ClinicOperatingPeriod_clinicId_startDate_idx" ON "ClinicOperatingPeriod"("clinicId", "startDate");
CREATE INDEX "Clinic_tenantId_recordStatus_idx" ON "Clinic"("tenantId", "recordStatus");

-- AddForeignKey
ALTER TABLE "ClinicOperatingPeriod" ADD CONSTRAINT "ClinicOperatingPeriod_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
