-- GRW-P2-W (wave 6, lane A2): provider credit v2 (ADR-048, KX-30 section 14). Additive and idempotent.
-- The wallet is PROVIDER credit only: no patient id column anywhere, no conversion, no transfer. Patient credit lives in the Kiorex platform database.

-- CreditReason additions (reasons for the founder's list of uses)
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'KIOREX_FEE_OFFSET';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_OFFSET';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'DISPUTE_WIN';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'ONBOARDING';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'CONNECT_BONUS';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'USAGE_PURCHASE';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'MARKETING_SPEND';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'SPONSORED_PROMOTION';
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'SPONSORED_PROMOTION_REVERSAL';

DO $$ BEGIN
  CREATE TYPE "CreditCategory" AS ENUM ('SERVICE_RECOVERY', 'ONBOARDING', 'PROMOTIONAL', 'REFERRAL', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CreditReservationState" AS ENUM ('RESERVED', 'DEBITED', 'RELEASED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CreditLedgerEntry" ADD COLUMN IF NOT EXISTS "category" "CreditCategory";
ALTER TABLE "CreditLedgerEntry" ADD COLUMN IF NOT EXISTS "campaignRef" TEXT;
ALTER TABLE "CreditLedgerEntry" ADD COLUMN IF NOT EXISTS "restrictions" JSONB;
ALTER TABLE "CreditLedgerEntry" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedgerEntry_walletId_idempotencyKey_key" ON "CreditLedgerEntry"("walletId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_walletId_category_idx" ON "CreditLedgerEntry"("walletId", "category");

-- W-5: append-only. Only `remaining` (the FIFO cache) may change on an existing row; no DELETE, except the cascade of the wallet row itself (closing a tenant).
CREATE OR REPLACE FUNCTION credit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM "CreditWallet" WHERE "id" = OLD."walletId") THEN
      RETURN OLD; -- cascade from the wallet (tenant closure forfeits promotional credit per terms)
    END IF;
    RAISE EXCEPTION 'CreditLedgerEntry is append-only (DELETE refused)' USING ERRCODE = '23000';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."walletId" IS DISTINCT FROM OLD."walletId" OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."sourceRef" IS DISTINCT FROM OLD."sourceRef" OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."category" IS DISTINCT FROM OLD."category"
     OR NEW."campaignRef" IS DISTINCT FROM OLD."campaignRef" OR NEW."restrictions" IS DISTINCT FROM OLD."restrictions"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" THEN
    RAISE EXCEPTION 'CreditLedgerEntry is append-only (only remaining may change)' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS credit_ledger_append_only_trg ON "CreditLedgerEntry";
CREATE TRIGGER credit_ledger_append_only_trg BEFORE UPDATE OR DELETE ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION credit_ledger_append_only();

-- Budget holds for provider-sponsored patient promotions (reserve at booking, debit at completion). Opaque references only: no patient column, no patient ledger id.
CREATE TABLE IF NOT EXISTS "CreditReservation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "state" "CreditReservationState" NOT NULL DEFAULT 'RESERVED',
    "idempotencyKey" TEXT NOT NULL,
    "promotionRef" TEXT NOT NULL,
    "holdRef" TEXT NOT NULL,
    "debitedAmount" DECIMAL(14,2),
    "shortfall" DECIMAL(14,2),
    "debitEntryId" TEXT,
    "reversalEntryId" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditReservation_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "CreditReservation_wallet_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditReservation_walletId_idempotencyKey_key" ON "CreditReservation"("walletId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "CreditReservation_walletId_state_idx" ON "CreditReservation"("walletId", "state");
CREATE INDEX IF NOT EXISTS "CreditReservation_promotionRef_idx" ON "CreditReservation"("promotionRef");

-- Prepaid usage units (messaging, storage). Units are never currency; the wallet only records the CONSUME that bought them.
CREATE TABLE IF NOT EXISTS "UsageUnitLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "purchaseEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageUnitLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UsageUnitLedger_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UsageUnitLedger_tenantId_idempotencyKey_key" ON "UsageUnitLedger"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "UsageUnitLedger_tenantId_unit_idx" ON "UsageUnitLedger"("tenantId", "unit");

CREATE OR REPLACE FUNCTION usage_unit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = OLD."tenantId") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'UsageUnitLedger is append-only' USING ERRCODE = '23000';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS usage_unit_ledger_append_only_trg ON "UsageUnitLedger";
CREATE TRIGGER usage_unit_ledger_append_only_trg BEFORE UPDATE OR DELETE ON "UsageUnitLedger" FOR EACH ROW EXECUTE FUNCTION usage_unit_ledger_append_only();

-- Daily reconcile report (Sigma ledger = balance, categories, reservations, usage units)
CREATE TABLE IF NOT EXISTS "CreditReconcileRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wallets" INTEGER NOT NULL,
    "repaired" INTEGER NOT NULL,
    "expired" INTEGER NOT NULL,
    "mismatches" INTEGER NOT NULL,
    "details" JSONB,
    CONSTRAINT "CreditReconcileRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditReconcileRun_ranAt_idx" ON "CreditReconcileRun"("ranAt");
