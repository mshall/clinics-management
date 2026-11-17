-- CreateEnum
CREATE TYPE "KiorlyInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "KiorlyLineType" AS ENUM ('SUBSCRIPTION', 'SEAT', 'ADDON', 'USAGE_OVERAGE', 'KIOREX_COMMISSION', 'KIOREX_COMMISSION_OFFSET', 'PREPAID', 'CREDIT', 'DISCOUNT', 'TAX');

-- CreateTable
CREATE TABLE "KiorlyInvoiceNumberSequence" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorlyInvoiceNumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiorlyInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "KiorlyInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "creditsApplied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "etaUuid" TEXT,
    "creditMemo" BOOLEAN NOT NULL DEFAULT false,
    "voidOfInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorlyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiorlyInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "KiorlyLineType" NOT NULL,
    "descEn" TEXT NOT NULL,
    "descAr" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitAmount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorlyInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyInvoiceNumberSequence_marketId_year_key" ON "KiorlyInvoiceNumberSequence"("marketId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyInvoice_number_key" ON "KiorlyInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyInvoice_tenantId_periodKey_key" ON "KiorlyInvoice"("tenantId", "periodKey");

-- CreateIndex
CREATE INDEX "KiorlyInvoice_tenantId_status_idx" ON "KiorlyInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "KiorlyInvoice_tenantId_createdAt_idx" ON "KiorlyInvoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "KiorlyInvoiceLine_invoiceId_idx" ON "KiorlyInvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "KiorlyInvoiceNumberSequence" ADD CONSTRAINT "KiorlyInvoiceNumberSequence_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyInvoice" ADD CONSTRAINT "KiorlyInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyInvoice" ADD CONSTRAINT "KiorlyInvoice_voidOfInvoiceId_fkey" FOREIGN KEY ("voidOfInvoiceId") REFERENCES "KiorlyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyInvoiceLine" ADD CONSTRAINT "KiorlyInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "KiorlyInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;