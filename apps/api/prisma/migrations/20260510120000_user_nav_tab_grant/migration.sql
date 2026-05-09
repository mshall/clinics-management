-- Clinic / group admins can assign which sidebar tabs a user may see (intersected with role defaults on read).

CREATE TABLE "UserNavTabGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tabKeys" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNavTabGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNavTabGrant_tenantId_userId_key" ON "UserNavTabGrant"("tenantId", "userId");

CREATE INDEX "UserNavTabGrant_tenantId_idx" ON "UserNavTabGrant"("tenantId");

ALTER TABLE "UserNavTabGrant" ADD CONSTRAINT "UserNavTabGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNavTabGrant" ADD CONSTRAINT "UserNavTabGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNavTabGrant" ADD CONSTRAINT "UserNavTabGrant_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
