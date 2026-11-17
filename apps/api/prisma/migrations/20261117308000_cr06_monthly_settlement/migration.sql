-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "kiorlySettlementCarry" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "KiorlyInvoice" ADD COLUMN "settlementSummaryJson" JSONB;