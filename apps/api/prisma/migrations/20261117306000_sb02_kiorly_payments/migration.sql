-- CreateEnum
CREATE TYPE "KiorlyPaymentMethodKind" AS ENUM ('CARD_TOKEN', 'MANUAL');

-- CreateEnum
CREATE TYPE "KiorlyPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'UNDER_REVIEW');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "kiorlyDunningPausedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "KiorlyInvoice" ADD COLUMN "paymentUnderReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KiorlyInvoice" ADD COLUMN "autoChargeAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KiorlyInvoice" ADD COLUMN "nextAutoChargeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "KiorlyInvoice_nextAutoChargeAt_idx" ON "KiorlyInvoice"("nextAutoChargeAt");

-- CreateTable
CREATE TABLE "KiorlyPaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" "KiorlyPaymentMethodKind" NOT NULL,
    "tokenRef" TEXT,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorlyPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiorlyPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "KiorlyPaymentStatus" NOT NULL,
    "proofUploadKey" TEXT,
    "verifiedBy" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorlyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiorlyPaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorlyPaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyPayment_providerRef_key" ON "KiorlyPayment"("providerRef");

-- CreateIndex
CREATE INDEX "KiorlyPayment_tenantId_createdAt_idx" ON "KiorlyPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "KiorlyPayment_invoiceId_status_idx" ON "KiorlyPayment"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyPayment_provider_idempotencyKey_key" ON "KiorlyPayment"("provider", "idempotencyKey");

-- CreateIndex
CREATE INDEX "KiorlyPaymentMethod_tenantId_isDefault_idx" ON "KiorlyPaymentMethod"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "KiorlyPaymentMethod_tenantId_provider_idx" ON "KiorlyPaymentMethod"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "KiorlyPaymentWebhookEvent_provider_idempotencyKey_key" ON "KiorlyPaymentWebhookEvent"("provider", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_defaultPaymentMethodId_fkey" FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "KiorlyPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyPaymentMethod" ADD CONSTRAINT "KiorlyPaymentMethod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyPayment" ADD CONSTRAINT "KiorlyPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorlyPayment" ADD CONSTRAINT "KiorlyPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "KiorlyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;