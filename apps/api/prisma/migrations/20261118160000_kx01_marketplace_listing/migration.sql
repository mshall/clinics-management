-- KX-01: Kiorex marketplace listings + platform integration client

CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'LIVE', 'PAUSED');

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "pausedReason" TEXT,
    "profileJson" JSONB NOT NULL DEFAULT '{}',
    "listedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceListing_clinicId_clinicianId_key" ON "MarketplaceListing"("clinicId", "clinicianId");
CREATE INDEX "MarketplaceListing_tenantId_clinicId_idx" ON "MarketplaceListing"("tenantId", "clinicId");
CREATE INDEX "MarketplaceListing_tenantId_status_idx" ON "MarketplaceListing"("tenantId", "status");
CREATE INDEX "MarketplaceListing_clinicId_status_idx" ON "MarketplaceListing"("clinicId", "status");

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformIntegrationClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['MARKETPLACE']::TEXT[],
    "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformIntegrationClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformIntegrationClient_clientKey_key" ON "PlatformIntegrationClient"("clientKey");