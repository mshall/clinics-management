-- CR-08 Commission disputes & adjustments

CREATE TYPE "CommissionDisputeReason" AS ENUM ('EXISTING_PATIENT', 'DID_NOT_ATTEND', 'DUPLICATE', 'OTHER');

CREATE TYPE "CommissionDisputeStatus" AS ENUM ('OPEN', 'AUTO_APPROVED', 'APPROVED', 'REJECTED');

CREATE TABLE "CommissionDispute" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" "CommissionDisputeReason" NOT NULL,
    "note" TEXT,
    "status" "CommissionDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CommissionDispute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionDispute_chargeId_key" ON "CommissionDispute"("chargeId");
CREATE INDEX "CommissionDispute_status_createdAt_idx" ON "CommissionDispute"("status", "createdAt");
CREATE INDEX "CommissionDispute_tenantId_idx" ON "CommissionDispute"("tenantId");

ALTER TABLE "CommissionDispute" ADD CONSTRAINT "CommissionDispute_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "KiorexCommissionCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionDispute" ADD CONSTRAINT "CommissionDispute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;