-- CL-06 lab & radiology orders
CREATE TYPE "ClinicalOrderKind" AS ENUM ('LAB', 'IMAGING');
CREATE TYPE "ClinicalOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'IN_PROGRESS', 'RESULTS_READY', 'CANCELLED');

CREATE TABLE "ClinicalOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "kind" "ClinicalOrderKind" NOT NULL,
    "status" "ClinicalOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "resultsReadyAt" TIMESTAMP(3),
    "resultsJson" JSONB,
    "resultsPdfRelativePath" TEXT,
    "notes" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "resultValue" TEXT,
    "resultUnit" TEXT,
    "resultFlag" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicalOrder_tenantId_patientId_status_idx" ON "ClinicalOrder"("tenantId", "patientId", "status");
CREATE INDEX "ClinicalOrder_tenantId_encounterId_idx" ON "ClinicalOrder"("tenantId", "encounterId");
CREATE INDEX "ClinicalOrderItem_orderId_idx" ON "ClinicalOrderItem"("orderId");

ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrderItem" ADD CONSTRAINT "ClinicalOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ClinicalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
