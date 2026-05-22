-- Scheduled surgical / procedural operations linked to patient and performing physician

CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "downPayment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Operation_tenantId_clinicId_operationDate_idx" ON "Operation"("tenantId", "clinicId", "operationDate");
CREATE INDEX "Operation_tenantId_clinicianId_operationDate_idx" ON "Operation"("tenantId", "clinicianId", "operationDate");
CREATE INDEX "Operation_patientId_idx" ON "Operation"("patientId");

ALTER TABLE "Operation" ADD CONSTRAINT "Operation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
