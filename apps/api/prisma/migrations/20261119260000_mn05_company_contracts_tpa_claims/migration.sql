-- CreateEnum
CREATE TYPE "ClaimBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimLineStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID', 'RESUBMITTED');

-- CreateEnum
CREATE TYPE "RemittanceLineMatchStatus" AS ENUM ('MATCHED', 'UNMATCHED');

-- DropIndex
DROP INDEX "Appointment_tenantId_bookingSource_idx";

-- DropIndex
DROP INDEX "FiscalSubmission_fiscalDeviceId_status_createdAt_idx";

-- AlterTable
ALTER TABLE "FiscalPosChain" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FiscalSubmission" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "payerCompanyId" TEXT;

-- AlterTable
ALTER TABLE "OutboxEvent" ALTER COLUMN "aggregateType" DROP DEFAULT,
ALTER COLUMN "aggregateId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TenantOffboarding" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TenantReportSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ClaimBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payerCompanyId" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "ClaimBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "submittedAt" TIMESTAMP(3),
    "b2bInvoiceNumber" TEXT,
    "b2bInvoicePayload" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "patientId" TEXT NOT NULL,
    "preAuthId" TEXT,
    "externalRef" TEXT NOT NULL,
    "amountClaimed" DECIMAL(14,2) NOT NULL,
    "amountCopay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountApproved" DECIMAL(14,2),
    "amountPaid" DECIMAL(14,2),
    "status" "ClaimLineStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "resubmissionOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRemittance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payerCompanyId" TEXT NOT NULL,
    "batchId" TEXT,
    "reference" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRemittanceLine" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "claimLineId" TEXT,
    "externalRef" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "RemittanceLineMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimRemittanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimBatch_tenantId_payerCompanyId_periodFrom_idx" ON "ClaimBatch"("tenantId", "payerCompanyId", "periodFrom");

-- CreateIndex
CREATE INDEX "ClaimBatch_tenantId_status_idx" ON "ClaimBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClaimLine_tenantId_status_idx" ON "ClaimLine"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClaimLine_externalRef_idx" ON "ClaimLine"("externalRef");

-- CreateIndex
CREATE INDEX "ClaimLine_invoiceId_idx" ON "ClaimLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLine_batchId_invoiceId_invoiceLineId_key" ON "ClaimLine"("batchId", "invoiceId", "invoiceLineId");

-- CreateIndex
CREATE INDEX "ClaimRemittance_tenantId_payerCompanyId_idx" ON "ClaimRemittance"("tenantId", "payerCompanyId");

-- CreateIndex
CREATE INDEX "ClaimRemittance_batchId_idx" ON "ClaimRemittance"("batchId");

-- CreateIndex
CREATE INDEX "ClaimRemittanceLine_remittanceId_idx" ON "ClaimRemittanceLine"("remittanceId");

-- CreateIndex
CREATE INDEX "ClaimRemittanceLine_claimLineId_idx" ON "ClaimRemittanceLine"("claimLineId");

-- CreateIndex
CREATE INDEX "Invoice_payerCompanyId_issueDate_idx" ON "Invoice"("payerCompanyId", "issueDate");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "PayerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "PayerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_resubmissionOfId_fkey" FOREIGN KEY ("resubmissionOfId") REFERENCES "ClaimLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRemittance" ADD CONSTRAINT "ClaimRemittance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRemittance" ADD CONSTRAINT "ClaimRemittance_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "PayerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRemittance" ADD CONSTRAINT "ClaimRemittance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRemittanceLine" ADD CONSTRAINT "ClaimRemittanceLine_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "ClaimRemittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRemittanceLine" ADD CONSTRAINT "ClaimRemittanceLine_claimLineId_fkey" FOREIGN KEY ("claimLineId") REFERENCES "ClaimLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
