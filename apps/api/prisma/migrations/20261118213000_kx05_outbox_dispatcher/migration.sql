-- KX-05: transactional outbox dispatcher fields
ALTER TABLE "OutboxEvent" RENAME COLUMN "topic" TO "type";
ALTER TABLE "OutboxEvent" RENAME COLUMN "payloadJson" TO "payload";
ALTER TABLE "OutboxEvent" RENAME COLUMN "publishedAt" TO "sentAt";

ALTER TABLE "OutboxEvent" ADD COLUMN "aggregateType" TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE "OutboxEvent" ADD COLUMN "aggregateId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OutboxEvent" ADD COLUMN "target" TEXT NOT NULL DEFAULT 'KIOREX';
ALTER TABLE "OutboxEvent" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboxEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "OutboxEvent"
SET
  "aggregateType" = COALESCE(NULLIF(payload->>'aggregateType', ''), 'Tenant'),
  "aggregateId" = COALESCE(
    NULLIF(payload->>'appointmentId', ''),
    NULLIF(payload->>'listingId', ''),
    NULLIF(payload->>'chargeId', ''),
    "tenantId"
  )
WHERE "aggregateId" = '';

CREATE INDEX "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx" ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");