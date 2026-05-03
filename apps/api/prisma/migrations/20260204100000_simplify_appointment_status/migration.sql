-- Reduce appointment lifecycle to: SCHEDULED, CONFIRMED, CANCELLED, COMPLETED.
-- New appointments default to SCHEDULED; linking an encounter moves to CONFIRMED until encounter is finalized (COMPLETED).

ALTER TYPE "AppointmentStatus" RENAME TO "AppointmentStatus_old";

CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Appointment"
  ALTER COLUMN "status" TYPE "AppointmentStatus"
  USING (
    CASE "status"::text
      WHEN 'COMPLETED' THEN 'COMPLETED'::"AppointmentStatus"
      WHEN 'CANCELLED' THEN 'CANCELLED'::"AppointmentStatus"
      WHEN 'CONFIRMED' THEN 'CONFIRMED'::"AppointmentStatus"
      WHEN 'SCHEDULED' THEN 'SCHEDULED'::"AppointmentStatus"
      WHEN 'PENDING_CONFIRMATION' THEN 'SCHEDULED'::"AppointmentStatus"
      WHEN 'IN_PROGRESS' THEN 'CONFIRMED'::"AppointmentStatus"
      WHEN 'CHECKED_IN' THEN 'CONFIRMED'::"AppointmentStatus"
      WHEN 'NO_SHOW' THEN 'CANCELLED'::"AppointmentStatus"
      ELSE 'SCHEDULED'::"AppointmentStatus"
    END
  );

ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'::"AppointmentStatus";

DROP TYPE "AppointmentStatus_old";
