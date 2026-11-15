-- ETA queue links beyond BillingPayment; MFA; EGP defaults; transfer verification

CREATE TYPE "TransferVerificationStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'VERIFIED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaTotpSecret" TEXT;

ALTER TABLE "EtaReceiptSubmission" ADD COLUMN "revenueEntryId" TEXT;
ALTER TABLE "EtaReceiptSubmission" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "EtaReceiptSubmission" ADD COLUMN "signature" TEXT;
ALTER TABLE "EtaReceiptSubmission" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "EtaReceiptSubmission_revenueEntryId_key" ON "EtaReceiptSubmission"("revenueEntryId");
CREATE UNIQUE INDEX "EtaReceiptSubmission_invoiceId_key" ON "EtaReceiptSubmission"("invoiceId");
CREATE UNIQUE INDEX "EtaReceiptSubmission_idempotencyKey_key" ON "EtaReceiptSubmission"("idempotencyKey");

ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_revenueEntryId_fkey" FOREIGN KEY ("revenueEntryId") REFERENCES "RevenueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevenueEntry" ADD COLUMN "transferVerificationStatus" "TransferVerificationStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

ALTER TABLE "Tenant" ALTER COLUMN "baseCurrency" SET DEFAULT 'EGP';
ALTER TABLE "Clinic" ALTER COLUMN "defaultCurrency" SET DEFAULT 'EGP';
ALTER TABLE "Encounter" ALTER COLUMN "visitFeeCurrency" SET DEFAULT 'EGP';
ALTER TABLE "Operation" ALTER COLUMN "feeCurrency" SET DEFAULT 'EGP';