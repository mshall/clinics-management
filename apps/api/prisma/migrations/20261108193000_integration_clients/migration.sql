-- CreateEnum
CREATE TYPE "IntegrationScope" AS ENUM ('APPOINTMENTS_READ', 'APPOINTMENTS_WRITE');

-- CreateTable
CREATE TABLE "IntegrationClient" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "scopes" "IntegrationScope"[],
  "allowedClinicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdByUserId" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationClient_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appointment" ADD COLUMN "integrationClientId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "externalReference" TEXT;

CREATE UNIQUE INDEX "IntegrationClient_tenantId_clientKey_key" ON "IntegrationClient"("tenantId", "clientKey");
CREATE INDEX "IntegrationClient_tenantId_idx" ON "IntegrationClient"("tenantId");
CREATE UNIQUE INDEX "Appointment_integrationClientId_externalReference_key" ON "Appointment"("integrationClientId", "externalReference");
CREATE INDEX "Appointment_tenantId_externalReference_idx" ON "Appointment"("tenantId", "externalReference");

ALTER TABLE "IntegrationClient" ADD CONSTRAINT "IntegrationClient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationClient" ADD CONSTRAINT "IntegrationClient_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_integrationClientId_fkey" FOREIGN KEY ("integrationClientId") REFERENCES "IntegrationClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
