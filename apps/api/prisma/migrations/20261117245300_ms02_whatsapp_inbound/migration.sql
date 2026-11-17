-- MS-02: WhatsApp inbound replies, outbox, reschedule tokens
ALTER TABLE "Appointment" ADD COLUMN "whatsappConfirmedAt" TIMESTAMP(3);

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentRescheduleToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentRescheduleToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "action" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentRescheduleToken_appointmentId_key" ON "AppointmentRescheduleToken"("appointmentId");
CREATE UNIQUE INDEX "AppointmentRescheduleToken_tokenHash_key" ON "AppointmentRescheduleToken"("tokenHash");
CREATE INDEX "AppointmentRescheduleToken_tenantId_idx" ON "AppointmentRescheduleToken"("tenantId");
CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerMessageId_key" ON "WhatsAppInboundEvent"("providerMessageId");
CREATE INDEX "WhatsAppInboundEvent_tenantId_appointmentId_idx" ON "WhatsAppInboundEvent"("tenantId", "appointmentId");
CREATE INDEX "OutboxEvent_tenantId_status_createdAt_idx" ON "OutboxEvent"("tenantId", "status", "createdAt");

ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentRescheduleToken" ADD CONSTRAINT "AppointmentRescheduleToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentRescheduleToken" ADD CONSTRAINT "AppointmentRescheduleToken_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundEvent" ADD CONSTRAINT "WhatsAppInboundEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Market"
SET "providerConfig" = jsonb_set(
  COALESCE("providerConfig", '{}'::jsonb),
  '{messaging,whatsapp,templates,appointment_reminder_whatsapp,quickReplyButtons}',
  '["KIORLY_CONFIRM","KIORLY_CANCEL","KIORLY_RESCHEDULE"]'::jsonb,
  true
)
WHERE "code" = 'EG';

UPDATE "Market"
SET "providerConfig" = jsonb_set(
  COALESCE("providerConfig", '{}'::jsonb),
  '{messaging,whatsapp,templates,appointment_reschedule_link}',
  '{"name":"kiorly_reschedule_link","language":"en","variables":["link"]}'::jsonb,
  true
)
WHERE "code" = 'EG';