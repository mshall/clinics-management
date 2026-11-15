-- Organization-defined payment / transfer channels (account or mobile for collection)
CREATE TABLE "TenantPaymentChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "accountNumber" TEXT,
    "mobileNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPaymentChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPaymentChannel_tenantId_channelKey_key" ON "TenantPaymentChannel"("tenantId", "channelKey");
CREATE INDEX "TenantPaymentChannel_tenantId_idx" ON "TenantPaymentChannel"("tenantId");

ALTER TABLE "TenantPaymentChannel" ADD CONSTRAINT "TenantPaymentChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;