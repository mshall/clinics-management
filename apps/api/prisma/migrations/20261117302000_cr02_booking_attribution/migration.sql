-- CR-02 booking attribution & new-patient rule
CREATE TYPE "BookingSource" AS ENUM (
  'FRONT_DESK',
  'PHONE',
  'WALK_IN',
  'CLINIC_LINK',
  'KIOREX_MARKETPLACE',
  'KIOREX_WHATSAPP',
  'INTEGRATION',
  'IMPORT'
);

ALTER TYPE "PatientAcquisitionChannel" ADD VALUE IF NOT EXISTS 'KIOREX';

ALTER TABLE "Appointment" ADD COLUMN "bookingSource" "BookingSource" NOT NULL DEFAULT 'FRONT_DESK';
ALTER TABLE "Appointment" ADD COLUMN "attributionJson" JSONB;
ALTER TABLE "Appointment" ADD COLUMN "isNewPatientAtBooking" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "newPatientCheckedAt" TIMESTAMP(3);

CREATE INDEX "Appointment_tenantId_bookingSource_idx" ON "Appointment"("tenantId", "bookingSource");