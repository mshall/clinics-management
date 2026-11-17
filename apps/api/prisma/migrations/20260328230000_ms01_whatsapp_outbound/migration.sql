-- MS-01: WhatsApp Cloud API delivery metadata on outbound queue
ALTER TABLE "OutboundMessage" ADD COLUMN "templateName" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "variablesJson" JSONB;
ALTER TABLE "OutboundMessage" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "failureClass" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboundMessage" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "OutboundMessage" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "OutboundMessage" ADD COLUMN "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OutboundMessage_providerMessageId_key" ON "OutboundMessage"("providerMessageId");
CREATE INDEX "OutboundMessage_tenantId_failureClass_idx" ON "OutboundMessage"("tenantId", "failureClass");
CREATE INDEX "OutboundMessage_patientId_idx" ON "OutboundMessage"("patientId");

UPDATE "Market"
SET "providerConfig" = COALESCE("providerConfig", '{}'::jsonb) || '{
  "messaging": {
    "whatsapp": {
      "provider": "meta_cloud",
      "enabled": true,
      "templates": {
        "appointment_reminder_whatsapp": { "name": "kiorly_appointment_reminder", "language": "en", "variables": ["name", "clinic", "time"] },
        "appointment_confirm": { "name": "kiorly_appointment_confirm", "language": "en", "variables": ["name", "clinic", "time"] },
        "auth_otp": { "name": "kiorly_auth_otp", "language": "en", "variables": ["code"] }
      }
    }
  }
}'::jsonb
WHERE "code" = 'EG';