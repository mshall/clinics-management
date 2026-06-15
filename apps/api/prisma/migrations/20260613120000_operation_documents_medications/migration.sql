-- CreateEnum
CREATE TYPE "OperationDocumentKind" AS ENUM ('ATTACHMENT', 'PRESCRIPTION');

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN "noMedications" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OperationDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" "OperationDocumentKind" NOT NULL DEFAULT 'ATTACHMENT',
    "description" TEXT,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "relativePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationMedication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationMedication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationDocument_tenantId_idx" ON "OperationDocument"("tenantId");

-- CreateIndex
CREATE INDEX "OperationDocument_operationId_idx" ON "OperationDocument"("operationId");

-- CreateIndex
CREATE INDEX "OperationMedication_tenantId_idx" ON "OperationMedication"("tenantId");

-- CreateIndex
CREATE INDEX "OperationMedication_operationId_idx" ON "OperationMedication"("operationId");

-- AddForeignKey
ALTER TABLE "OperationDocument" ADD CONSTRAINT "OperationDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationDocument" ADD CONSTRAINT "OperationDocument_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationMedication" ADD CONSTRAINT "OperationMedication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationMedication" ADD CONSTRAINT "OperationMedication_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
