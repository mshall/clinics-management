-- Org ETA & WhatsApp settings, clinic ETA fields, MFA recovery, outbound appointment link

ALTER TABLE "Tenant" ADD COLUMN "whatsAppRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "appointmentReminderHoursBefore" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Tenant" ADD COLUMN "etaDefaultTaxpayerActivityCode" TEXT NOT NULL DEFAULT '8690';
ALTER TABLE "Tenant" ADD COLUMN "etaDefaultItemCode" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "etaEsignatureLabel" TEXT;

ALTER TABLE "Clinic" ADD COLUMN "etaBranchCode" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "etaTaxpayerActivityCode" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "etaDefaultItemCode" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "etaReceiptsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN "etaIncludeLogoOnReceipt" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User" ADD COLUMN "mfaRecoveryHashes" JSONB;

ALTER TABLE "OutboundMessage" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "metadata" JSONB;

CREATE INDEX "OutboundMessage_appointmentId_idx" ON "OutboundMessage"("appointmentId");