-- AlterEnum
ALTER TYPE "IntegrationScope" ADD VALUE 'OPERATIONS_READ';
ALTER TYPE "IntegrationScope" ADD VALUE 'OPERATIONS_WRITE';

-- CreateEnum
CREATE TYPE "IntegrationWebhookEvent" AS ENUM ('APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'OPERATION_BOOKED', 'OPERATION_CANCELLED');

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "integrationClientId" TEXT,
ADD COLUMN     "externalReference" TEXT;

-- CreateTable
CREATE TABLE "IntegrationWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationClientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "signingSecret" TEXT NOT NULL,
    "eventTypes" "IntegrationWebhookEvent"[],
    "deactivatedAt" TIMESTAMP(3),
    "lastDeliveredAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationWebhook_integrationClientId_idx" ON "IntegrationWebhook"("integrationClientId");

-- CreateIndex
CREATE INDEX "IntegrationWebhook_tenantId_idx" ON "IntegrationWebhook"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_integrationClientId_externalReference_key" ON "Operation"("integrationClientId", "externalReference");

-- CreateIndex
CREATE INDEX "Operation_tenantId_externalReference_idx" ON "Operation"("tenantId", "externalReference");

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_integrationClientId_fkey" FOREIGN KEY ("integrationClientId") REFERENCES "IntegrationClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_integrationClientId_fkey" FOREIGN KEY ("integrationClientId") REFERENCES "IntegrationClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
