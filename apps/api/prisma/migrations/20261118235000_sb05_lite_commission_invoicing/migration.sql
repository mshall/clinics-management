-- SB-05: idempotent Lite carry-forward + Kiorex billing pause flag
ALTER TABLE "Tenant" ADD COLUMN "kiorlySettlementCarryPeriodKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "kiorlySettlementCarryIn" DECIMAL(14,2);
ALTER TABLE "Tenant" ADD COLUMN "kiorexBillingPausedAt" TIMESTAMP(3);
