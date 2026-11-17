-- PL-03: tenant entitlement overrides (ops)

CREATE TABLE "TenantEntitlementOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEntitlementOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantEntitlementOverride_tenantId_key_key" ON "TenantEntitlementOverride"("tenantId", "key");
CREATE INDEX "TenantEntitlementOverride_tenantId_idx" ON "TenantEntitlementOverride"("tenantId");

ALTER TABLE "TenantEntitlementOverride" ADD CONSTRAINT "TenantEntitlementOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;