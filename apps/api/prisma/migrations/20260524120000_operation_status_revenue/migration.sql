-- Operation workflow status + link revenue to completed operations

CREATE TYPE "OperationStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

ALTER TABLE "Operation" ADD COLUMN "status" "OperationStatus" NOT NULL DEFAULT 'SCHEDULED';

ALTER TABLE "RevenueEntry" ADD COLUMN "operationId" TEXT;

CREATE INDEX "RevenueEntry_operationId_idx" ON "RevenueEntry"("operationId");

ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Operation_tenantId_status_operationDate_idx" ON "Operation"("tenantId", "status", "operationDate");
