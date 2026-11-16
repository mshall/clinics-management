CREATE TYPE "FinancialVisibilityOverride" AS ENUM ('ROLE_DEFAULT', 'SHOW', 'HIDE');

CREATE TABLE "UserMoneyVisibilityOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationsOverride" "FinancialVisibilityOverride" NOT NULL DEFAULT 'ROLE_DEFAULT',
    "encountersOverride" "FinancialVisibilityOverride" NOT NULL DEFAULT 'ROLE_DEFAULT',
    "appointmentsOverride" "FinancialVisibilityOverride" NOT NULL DEFAULT 'ROLE_DEFAULT',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMoneyVisibilityOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMoneyVisibilityOverride_userId_key" ON "UserMoneyVisibilityOverride"("userId");
CREATE INDEX "UserMoneyVisibilityOverride_tenantId_userId_idx" ON "UserMoneyVisibilityOverride"("tenantId", "userId");

ALTER TABLE "UserMoneyVisibilityOverride" ADD CONSTRAINT "UserMoneyVisibilityOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMoneyVisibilityOverride" ADD CONSTRAINT "UserMoneyVisibilityOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMoneyVisibilityOverride" ADD CONSTRAINT "UserMoneyVisibilityOverride_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;