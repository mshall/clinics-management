-- MN-02 doctor revenue-share engine & statements
ALTER TABLE "CommissionRule" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "CommissionRule" ADD COLUMN "appointmentTypeId" TEXT;
ALTER TABLE "CommissionRule" ADD COLUMN "revenueCategory" TEXT;
ALTER TABLE "CommissionRule" ADD COLUMN "payerKey" TEXT;
ALTER TABLE "CommissionRule" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommissionRule" ADD COLUMN "label" TEXT;

CREATE TABLE "DoctorStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "adjustmentsJson" JSONB NOT NULL DEFAULT '[]',
    "payoutsJson" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DoctorStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoctorStatement_tenantId_clinicianId_periodKey_key" ON "DoctorStatement"("tenantId", "clinicianId", "periodKey");
CREATE INDEX "DoctorStatement_tenantId_periodKey_idx" ON "DoctorStatement"("tenantId", "periodKey");
