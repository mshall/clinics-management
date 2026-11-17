-- CR-04 Kiorex commission rates & benchmark guardrail
CREATE TYPE "FeeType" AS ENUM ('FLAT', 'PERCENT');

CREATE TABLE "KiorexCommissionRate" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "specialty" "ClinicalSpecialty",
    "feeType" "FeeType" NOT NULL DEFAULT 'FLAT',
    "amount" DECIMAL(14,2),
    "percent" DECIMAL(5,2),
    "minAmount" DECIMAL(14,2),
    "maxAmount" DECIMAL(14,2),
    "benchmarkFlat" DECIMAL(14,2),
    "benchmarkPercent" DECIMAL(5,2),
    "benchmarkSource" TEXT,
    "benchmarkCheckedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexCommissionRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KiorexCommissionRate_marketId_specialty_idx" ON "KiorexCommissionRate"("marketId", "specialty");
CREATE INDEX "KiorexCommissionRate_marketId_validFrom_validTo_idx" ON "KiorexCommissionRate"("marketId", "validFrom", "validTo");

ALTER TABLE "KiorexCommissionRate" ADD CONSTRAINT "KiorexCommissionRate_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;