-- KX-06: Kiorex reschedule & cancellation policy (both directions)
ALTER TABLE "Clinic" ADD COLUMN "kiorexCancellationPolicy" JSONB;

ALTER TABLE "Appointment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "depositRefundable" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0;
