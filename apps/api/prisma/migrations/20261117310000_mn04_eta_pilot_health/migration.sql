-- MN-04: ETA pilot production cutover — pilot week anchor + daily health alert cooldown
ALTER TABLE "Tenant" ADD COLUMN "etaPilotProductionStartedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "etaHealthLastAlertAt" TIMESTAMP(3);