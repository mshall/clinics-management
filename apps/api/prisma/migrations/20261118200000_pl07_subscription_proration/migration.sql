-- PL-07 upgrade, downgrade, seat changes & proration

ALTER TABLE "User" ADD COLUMN "billingSeatActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Subscription" ADD COLUMN "scheduledPlanId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "scheduledPlanPriceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "scheduledInterval" "BillingInterval";
ALTER TABLE "Subscription" ADD COLUMN "scheduledClinicianSeats" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "scheduledEffectiveAt" TIMESTAMP(3);

CREATE INDEX "Subscription_scheduledPlanId_idx" ON "Subscription"("scheduledPlanId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_scheduledPlanPriceId_fkey" FOREIGN KEY ("scheduledPlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;