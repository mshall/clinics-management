-- B2B counterparty on revenue; fiscal integration failure category.
ALTER TYPE "IntegrationFailureCategory" ADD VALUE IF NOT EXISTS 'FISCAL';

ALTER TABLE "RevenueEntry" ADD COLUMN IF NOT EXISTS "counterpartyName" TEXT;
ALTER TABLE "RevenueEntry" ADD COLUMN IF NOT EXISTS "counterpartyTaxNumber" TEXT;