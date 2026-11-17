-- PL-01: plan catalog, versioned market prices, tenant subscription grandfathering

CREATE TYPE "PlanKey" AS ENUM ('LITE', 'PRO', 'CLINIC', 'ENTERPRISE');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "PriceUnit" AS ENUM ('PER_TENANT', 'PER_CLINICIAN');
CREATE TYPE "TenantPlanSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" "PlanKey" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "unit" "PriceUnit" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "includedClinicians" INTEGER NOT NULL DEFAULT 1,
    "extraClinicianAmount" DECIMAL(14,2),
    "cohortKey" TEXT,
    "priceVersion" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanPrice_planId_marketId_interval_idx" ON "PlanPrice"("planId", "marketId", "interval");
CREATE INDEX "PlanPrice_marketId_validFrom_validTo_idx" ON "PlanPrice"("marketId", "validFrom", "validTo");

ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlanEntitlement" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanEntitlement_planId_key_key" ON "PlanEntitlement"("planId", "key");

ALTER TABLE "PlanEntitlement" ADD CONSTRAINT "PlanEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantPlanSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planPriceId" TEXT NOT NULL,
    "status" "TenantPlanSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPlanSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPlanSubscription_tenantId_key" ON "TenantPlanSubscription"("tenantId");
CREATE INDEX "TenantPlanSubscription_planPriceId_idx" ON "TenantPlanSubscription"("planPriceId");
CREATE INDEX "TenantPlanSubscription_planId_idx" ON "TenantPlanSubscription"("planId");

ALTER TABLE "TenantPlanSubscription" ADD CONSTRAINT "TenantPlanSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantPlanSubscription" ADD CONSTRAINT "TenantPlanSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPlanSubscription" ADD CONSTRAINT "TenantPlanSubscription_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;