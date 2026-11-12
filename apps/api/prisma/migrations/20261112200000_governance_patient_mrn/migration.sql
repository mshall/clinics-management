-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "patientMrn" TEXT;

-- AlterTable
ALTER TABLE "IntegrationFailureLog" ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "patientMrn" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_patientMrn_createdAt_idx" ON "AuditLog"("tenantId", "patientMrn", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_tenantId_patientMrn_createdAt_idx" ON "IntegrationFailureLog"("tenantId", "patientMrn", "createdAt");
