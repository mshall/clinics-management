-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('GRANT', 'CONSUME', 'EXPIRE', 'REVERSE');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('KIOREX_LATE_REVERSAL', 'REFERRAL', 'PROMO', 'NO_SHOW_GUARANTEE', 'GOODWILL', 'DOWNGRADE_PRORATION', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "CreditWallet" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CreditWallet" ALTER COLUMN "balance" TYPE DECIMAL(14,2) USING ("balance"::DECIMAL(14,2));
ALTER TABLE "CreditWallet" ALTER COLUMN "balance" SET DEFAULT 0;

ALTER TABLE "CreditWallet" ALTER COLUMN "currency" DROP DEFAULT;

UPDATE "CreditWallet" cw
SET "currency" = t."baseCurrency"
FROM "Tenant" t
WHERE cw."tenantId" = t."id" AND (cw."currency" = 'credits' OR cw."currency" IS NULL OR cw."currency" = '');

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "remaining" DECIMAL(14,2),
    "expiresAt" TIMESTAMP(3),
    "sourceRef" TEXT,
    "invoiceId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_walletId_createdAt_idx" ON "CreditLedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_walletId_expiresAt_idx" ON "CreditLedgerEntry"("walletId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;