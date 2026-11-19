-- CL-07 dental chart + specialty pack support
CREATE TABLE "DentalChartTooth" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "toothFdi" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "planNote" TEXT,
    "feeAmount" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DentalChartTooth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DentalChartTooth_patientId_toothFdi_key" ON "DentalChartTooth"("patientId", "toothFdi");
CREATE INDEX "DentalChartTooth_tenantId_patientId_idx" ON "DentalChartTooth"("tenantId", "patientId");
ALTER TABLE "DentalChartTooth" ADD CONSTRAINT "DentalChartTooth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DentalChartTooth" ADD CONSTRAINT "DentalChartTooth_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
