-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'KIOREX_PAY';

-- AlterTable
ALTER TABLE "PatientDeposit" ADD COLUMN "externalRef" TEXT,
ADD COLUMN "payoutRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeposit_tenantId_source_externalRef_key" ON "PatientDeposit"("tenantId", "source", "externalRef");

-- CreateTable
CREATE TABLE "KiorexPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT,
    "payoutRef" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "depositRefs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorexPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KiorexPayout_tenantId_payoutRef_key" ON "KiorexPayout"("tenantId", "payoutRef");

-- CreateIndex
CREATE INDEX "KiorexPayout_tenantId_paidAt_idx" ON "KiorexPayout"("tenantId", "paidAt");

-- KX-07: every market pack gains the Kiorex Pay method (collected by Kiorex, paid out to the clinic).
UPDATE "Market"
SET "paymentMethods" = COALESCE("paymentMethods", '[]'::jsonb) || '[{"key":"KIOREX_PAY","labelKey":"payment.kiorexPay","fiscalPaymentCode":"O"}]'::jsonb
WHERE NOT (COALESCE("paymentMethods", '[]'::jsonb) @> '[{"key":"KIOREX_PAY"}]'::jsonb);

-- AlterTable
ALTER TABLE "BillingPaymentAllocation" ADD COLUMN "revenueEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAllocation_revenueEntryId_key" ON "BillingPaymentAllocation"("revenueEntryId");
