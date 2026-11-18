-- PL-05 usage metering
CREATE TYPE "UsageMetric" AS ENUM ('WHATSAPP_MESSAGES', 'SMS_MESSAGES', 'AI_SCRIBE_MINUTES', 'AI_ASSISTANT_REQUESTS', 'ACTIVE_CLINICIANS');

CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageMeterDedup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMeterDedup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCounter_tenantId_periodKey_metric_key" ON "UsageCounter"("tenantId", "periodKey", "metric");
CREATE INDEX "UsageCounter_tenantId_periodKey_idx" ON "UsageCounter"("tenantId", "periodKey");
CREATE UNIQUE INDEX "UsageMeterDedup_tenantId_metric_sourceId_key" ON "UsageMeterDedup"("tenantId", "metric", "sourceId");