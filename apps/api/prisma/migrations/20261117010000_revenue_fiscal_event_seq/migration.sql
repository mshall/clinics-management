-- Per-event fiscal idempotency: each queued sale/return on a revenue row gets its own sequence.
ALTER TABLE "RevenueEntry" ADD COLUMN "fiscalSaleSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RevenueEntry" ADD COLUMN "fiscalReturnSeq" INTEGER NOT NULL DEFAULT 0;