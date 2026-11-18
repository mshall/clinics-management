-- PL-09 founding cohort
CREATE TABLE "Cohort" (
    "key" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "assignedCount" INTEGER NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3),
    "trialDays" INTEGER,
    "priceLockMonths" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "Cohort_marketId_opensAt_idx" ON "Cohort"("marketId", "opensAt");

ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;