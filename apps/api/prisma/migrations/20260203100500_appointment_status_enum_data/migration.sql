-- Runs after new enum values are committed (separate migration from enum additions).
UPDATE "Appointment" SET status = 'PENDING_CONFIRMATION' WHERE status = 'SCHEDULED';
UPDATE "Appointment" SET status = 'IN_PROGRESS' WHERE status = 'CHECKED_IN';

ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION'::"AppointmentStatus";
