-- COM-2: the organisation's commission rate as Kiorex reports it (read-only here). One row per tenant; the newest version wins.
CREATE TABLE IF NOT EXISTS "KiorexCommissionRateView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "view" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KiorexCommissionRateView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KiorexCommissionRateView_tenantId_key" ON "KiorexCommissionRateView"("tenantId");
DO $$ BEGIN
  ALTER TABLE "KiorexCommissionRateView" ADD CONSTRAINT "KiorexCommissionRateView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
