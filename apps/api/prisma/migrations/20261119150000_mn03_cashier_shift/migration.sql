-- MN-03 cash drawer shifts
CREATE TABLE "CashierShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "zNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL,
    "openingFloat" DECIMAL(14,2) NOT NULL,
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(14,2),
    "expectedCard" DECIMAL(14,2),
    "countedCash" DECIMAL(14,2),
    "countedCard" DECIMAL(14,2),
    "cashVariance" DECIMAL(14,2),
    "cardVariance" DECIMAL(14,2),
    "varianceNote" TEXT,
    "reviewThreshold" DECIMAL(14,2),
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "summaryJson" JSONB,
    CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashierShift_clinicId_zNumber_key" ON "CashierShift"("clinicId", "zNumber");
CREATE INDEX "CashierShift_tenantId_clinicId_status_idx" ON "CashierShift"("tenantId", "clinicId", "status");
CREATE INDEX "CashierShift_tenantId_needsReview_idx" ON "CashierShift"("tenantId", "needsReview");

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
