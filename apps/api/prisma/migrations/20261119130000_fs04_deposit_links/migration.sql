-- FS-04 deposits & payment links for high-risk bookings
ALTER TABLE "PatientDeposit" ADD COLUMN "linkTokenHash" TEXT;
ALTER TABLE "PatientDeposit" ADD COLUMN "linkExpiresAt" TIMESTAMP(3);
ALTER TABLE "PatientDeposit" ADD COLUMN "linkSentAt" TIMESTAMP(3);
ALTER TABLE "PatientDeposit" ADD COLUMN "requirementReasons" JSONB;
ALTER TABLE "PatientDeposit" ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PatientDeposit_linkTokenHash_key" ON "PatientDeposit"("linkTokenHash");

ALTER TABLE "Clinic" ADD COLUMN "depositPolicy" JSONB;
