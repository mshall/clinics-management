-- FS-01: appointment type buffers, marketplace rules, clinician overrides

ALTER TABLE "AppointmentType" ADD COLUMN "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppointmentType" ADD COLUMN "bufferAfterMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppointmentType" ADD COLUMN "requiresRoom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppointmentType" ADD COLUMN "marketplaceBookable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppointmentType" ADD COLUMN "minNoticeMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "AppointmentType" ADD COLUMN "maxDaysAhead" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "AppointmentType" ADD COLUMN "depositAmount" DECIMAL(14,2);
ALTER TABLE "AppointmentType" ADD COLUMN "newPatientOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ClinicianAppointmentTypeOverride" (
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "appointmentTypeId" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "feeAmount" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicianAppointmentTypeOverride_pkey" PRIMARY KEY ("clinicianId","appointmentTypeId")
);

CREATE INDEX "ClinicianAppointmentTypeOverride_tenantId_appointmentTypeId_idx" ON "ClinicianAppointmentTypeOverride"("tenantId", "appointmentTypeId");

ALTER TABLE "ClinicianAppointmentTypeOverride" ADD CONSTRAINT "ClinicianAppointmentTypeOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianAppointmentTypeOverride" ADD CONSTRAINT "ClinicianAppointmentTypeOverride_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianAppointmentTypeOverride" ADD CONSTRAINT "ClinicianAppointmentTypeOverride_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Normalize legacy availability JSON to versioned week schema (empty week = open defaults)
UPDATE "ClinicianAvailabilityTemplate"
SET "weekJson" = jsonb_build_object(
  'version', 1,
  'timezone', 'UTC',
  'days', jsonb_build_array(
    jsonb_build_object('weekday', 0, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 1, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 2, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 3, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 4, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 5, 'slots', '[]'::jsonb),
    jsonb_build_object('weekday', 6, 'slots', '[]'::jsonb)
  )
)
WHERE "weekJson" IS NULL
   OR jsonb_typeof("weekJson") <> 'object'
   OR NOT ("weekJson" ? 'version');

UPDATE "ClinicianAvailabilityTemplate"
SET "blockedJson" = '[]'::jsonb
WHERE "blockedJson" IS NULL OR jsonb_typeof("blockedJson") <> 'array';