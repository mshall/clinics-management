-- Fiscal submit pipeline: SUBMITTING state, retry metadata, org channel fiscal mapping
ALTER TYPE "FiscalSubmissionStatus" ADD VALUE IF NOT EXISTS 'SUBMITTING';

ALTER TABLE "FiscalSubmission" ADD COLUMN IF NOT EXISTS "submitAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FiscalSubmission" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "FiscalSubmission" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "TenantPaymentChannel" ADD COLUMN IF NOT EXISTS "referencePattern" TEXT NOT NULL DEFAULT '^[A-Za-z0-9][A-Za-z0-9\-_.]{5,31}$';
ALTER TABLE "TenantPaymentChannel" ADD COLUMN IF NOT EXISTS "fiscalPaymentCode" TEXT NOT NULL DEFAULT 'O';