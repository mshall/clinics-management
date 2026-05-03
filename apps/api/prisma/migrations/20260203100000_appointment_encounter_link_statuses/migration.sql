-- New appointment workflow enum values (must commit before use — data updates are in the next migration).
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'PENDING_CONFIRMATION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'CONFIRMED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_PROGRESS';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;
CREATE INDEX IF NOT EXISTS "Encounter_appointmentId_idx" ON "Encounter"("appointmentId");
DO $$ BEGIN
  ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
