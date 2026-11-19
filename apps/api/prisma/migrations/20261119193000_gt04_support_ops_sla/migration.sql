-- GT-04: support ops — channel, first-response SLA, engineering escalation
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "sourcePhone" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "firstRespondedAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "firstResponseDueAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "escalatedToEngineeringAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "engineeringEscalationNote" TEXT;

CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_channel_createdAt_idx" ON "SupportTicket"("tenantId", "channel", "createdAt");
