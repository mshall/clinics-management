-- ON-07: field-sales reps, rep-created tenants pending owner OTP confirmation
ALTER TYPE "UserRole" ADD VALUE 'SALES_REP';

CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'PENDING_OWNER');

ALTER TABLE "Tenant" ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "createdBySalesRepId" TEXT,
ADD COLUMN "ownerConfirmedAt" TIMESTAMP(3);

CREATE TABLE "SalesRep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesRep_userId_key" ON "SalesRep"("userId");

CREATE UNIQUE INDEX "SalesRep_code_key" ON "SalesRep"("code");
