-- New appointment workflow statuses (ignore if re-run)
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'PENDING_CONFIRMATION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'CONFIRMED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_PROGRESS';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE "Appointment" SET status = 'PENDING_CONFIRMATION' WHERE status = 'SCHEDULED';
UPDATE "Appointment" SET status = 'IN_PROGRESS' WHERE status = 'CHECKED_IN';

ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;
CREATE INDEX IF NOT EXISTS "Encounter_appointmentId_idx" ON "Encounter"("appointmentId");
DO $$ BEGIN
  ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION'::"AppointmentStatus";
