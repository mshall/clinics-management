-- RP-02 scheduled report delivery
CREATE TABLE IF NOT EXISTS "TenantReportSchedule" (
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "reportKeys" JSONB NOT NULL DEFAULT '["payments","operations"]',
    "channelEmail" BOOLEAN NOT NULL DEFAULT true,
    "channelWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "hourLocal" INTEGER NOT NULL DEFAULT 9,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantReportSchedule_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "TenantReportSchedule" ADD CONSTRAINT "TenantReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
