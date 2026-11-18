-- SB-06: scheduled moves of existing subscriptions to new PlanPrice versions (notice + priceLockUntil)
CREATE TYPE "PriceMigrationStatus" AS ENUM ('SCHEDULED', 'NOTICE_SENT', 'APPLIED', 'CANCELLED');

CREATE TABLE "PlanPriceMigration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromPlanPriceId" TEXT NOT NULL,
    "toPlanPriceId" TEXT NOT NULL,
    "status" "PriceMigrationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "noticeDueAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "noticeSentAt" TIMESTAMP(3),
    "priceLockUntil" TIMESTAMP(3),
    "fromMonthlyAmount" DECIMAL(14,2) NOT NULL,
    "toMonthlyAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "consentByContinuingAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPriceMigration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanPriceMigration_status_noticeDueAt_idx" ON "PlanPriceMigration"("status", "noticeDueAt");
CREATE INDEX "PlanPriceMigration_status_effectiveAt_idx" ON "PlanPriceMigration"("status", "effectiveAt");
CREATE INDEX "PlanPriceMigration_tenantId_idx" ON "PlanPriceMigration"("tenantId");
CREATE UNIQUE INDEX "PlanPriceMigration_subscriptionId_toPlanPriceId_key" ON "PlanPriceMigration"("subscriptionId", "toPlanPriceId");

ALTER TABLE "PlanPriceMigration" ADD CONSTRAINT "PlanPriceMigration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPriceMigration" ADD CONSTRAINT "PlanPriceMigration_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPriceMigration" ADD CONSTRAINT "PlanPriceMigration_fromPlanPriceId_fkey" FOREIGN KEY ("fromPlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPriceMigration" ADD CONSTRAINT "PlanPriceMigration_toPlanPriceId_fkey" FOREIGN KEY ("toPlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
