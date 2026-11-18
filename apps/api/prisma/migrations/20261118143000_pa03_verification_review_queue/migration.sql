-- PA-03: Verification review queue metrics (SLA + median review time)

ALTER TABLE "ClinicianVerification" ADD COLUMN "pendingAt" TIMESTAMP(3);
ALTER TABLE "ClinicianVerification" ADD COLUMN "reviewDurationMs" INTEGER;
ALTER TABLE "ClinicianVerification" ADD COLUMN "rejectReasonCode" TEXT;
ALTER TABLE "ClinicianVerification" ADD COLUMN "lastReviewChecklist" JSONB NOT NULL DEFAULT '[]';

UPDATE "ClinicianVerification"
SET "pendingAt" = "updatedAt"
WHERE "status" = 'PENDING' AND "pendingAt" IS NULL;

CREATE INDEX "ClinicianVerification_pendingAt_idx" ON "ClinicianVerification"("pendingAt");