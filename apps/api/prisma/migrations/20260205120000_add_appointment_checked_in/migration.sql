-- Checked-in: patient arrived / visit started; can be set manually or when an encounter is linked.
DO $$ BEGIN
  ALTER TYPE "AppointmentStatus" ADD VALUE 'CHECKED_IN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
