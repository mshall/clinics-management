-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "salesRepCode" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'credits',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_purpose_idx" ON "OtpChallenge"("phone", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "CreditWallet_tenantId_key" ON "CreditWallet"("tenantId");

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;