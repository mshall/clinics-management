-- CreateEnum
CREATE TYPE "AppointmentQueueStage" AS ENUM ('WAITING', 'CALLED', 'IN_EXAM');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "queueStage" "AppointmentQueueStage",
ADD COLUMN     "preferredRoomLabel" TEXT,
ADD COLUMN     "roomAssignedAt" TIMESTAMP(3);

-- Backfill: checked-in visits waiting for exam (legacy roomLabel → preferred, clear occupancy)
UPDATE "Appointment"
SET
  "preferredRoomLabel" = COALESCE("preferredRoomLabel", "roomLabel"),
  "roomLabel" = NULL,
  "queueStage" = 'WAITING'
WHERE "status" = 'CHECKED_IN' AND "queueStage" IS NULL;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "defaultExamRoomLabel" TEXT;