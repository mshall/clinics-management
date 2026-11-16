-- Scheduled fee payment plan at booking + transfer receipt on revenue
ALTER TABLE "Appointment" ADD COLUMN "scheduledCollectionMode" "VisitCollectionMode",
ADD COLUMN "scheduledTransferChannel" TEXT;

ALTER TABLE "RevenueEntry" ADD COLUMN "transferReceiptPath" TEXT,
ADD COLUMN "transferReceiptMimeType" TEXT,
ADD COLUMN "transferReceiptFileName" TEXT;