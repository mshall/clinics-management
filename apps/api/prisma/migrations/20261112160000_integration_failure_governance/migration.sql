-- CreateEnum
CREATE TYPE "IntegrationFailureStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "integrationFailureRetentionDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "integrationFailureLastSpikeAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IntegrationFailureLog" ADD COLUMN     "status" "IntegrationFailureStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByUserId" TEXT,
ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_tenantId_fingerprint_createdAt_idx" ON "IntegrationFailureLog"("tenantId", "fingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_tenantId_status_createdAt_idx" ON "IntegrationFailureLog"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationFailureLog" ADD CONSTRAINT "IntegrationFailureLog_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
