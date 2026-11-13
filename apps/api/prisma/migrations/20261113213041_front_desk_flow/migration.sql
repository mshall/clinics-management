-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "calledAt" TIMESTAMP(3),
ADD COLUMN     "checkInPaymentAmount" DECIMAL(14,2),
ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "queueTicketNumber" INTEGER;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "frontDeskRoomLabels" JSONB NOT NULL DEFAULT '["Room 1","Room 2","Room 3"]',
ADD COLUMN     "lastCalledTicketNumber" INTEGER;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "isVip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsChaperone" BOOLEAN NOT NULL DEFAULT false;
