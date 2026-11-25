-- GRW-P4-C: a provider refers a company to Kiorex as an enterprise lead. Company data only (the contact is an opaque reference); no reward, credit, fee share or wallet entry. Idempotent.
-- CreateTable
CREATE TABLE IF NOT EXISTS "ProviderB2BReferral" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "sizeBucket" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "contactRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderB2BReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderB2BReferral_tenantId_createdAt_idx" ON "ProviderB2BReferral"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderB2BReferral_tenantId_companyKey_idx" ON "ProviderB2BReferral"("tenantId", "companyKey");

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderB2BReferral_tenantId_fkey') THEN ALTER TABLE "ProviderB2BReferral" ADD CONSTRAINT "ProviderB2BReferral_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderB2BReferral_clinicId_fkey') THEN ALTER TABLE "ProviderB2BReferral" ADD CONSTRAINT "ProviderB2BReferral_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderB2BReferral_status_check') THEN
  ALTER TABLE "ProviderB2BReferral" ADD CONSTRAINT "ProviderB2BReferral_status_check" CHECK ("status" IN ('SUBMITTED') AND "sizeBucket" IN ('1_49','50_199','200_999','1000_PLUS','UNKNOWN') AND length("companyName") BETWEEN 2 AND 120);
END IF; END $$;
