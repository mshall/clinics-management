-- CreateEnum
CREATE TYPE "IntegrationFailureCategory" AS ENUM ('AUTH', 'APPOINTMENT', 'OPERATION', 'WEBHOOK');

-- CreateTable
CREATE TABLE "IntegrationFailureLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationClientId" TEXT,
    "integrationClientName" TEXT,
    "clinicId" TEXT,
    "category" "IntegrationFailureCategory" NOT NULL,
    "operation" TEXT NOT NULL,
    "httpMethod" TEXT,
    "httpPath" TEXT,
    "statusCode" INTEGER NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT NOT NULL,
    "trace" JSONB NOT NULL,
    "requestContext" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationFailureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_tenantId_createdAt_idx" ON "IntegrationFailureLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_tenantId_category_createdAt_idx" ON "IntegrationFailureLog"("tenantId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationFailureLog_integrationClientId_createdAt_idx" ON "IntegrationFailureLog"("integrationClientId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationFailureLog" ADD CONSTRAINT "IntegrationFailureLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationFailureLog" ADD CONSTRAINT "IntegrationFailureLog_integrationClientId_fkey" FOREIGN KEY ("integrationClientId") REFERENCES "IntegrationClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationFailureLog" ADD CONSTRAINT "IntegrationFailureLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
