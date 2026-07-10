-- Tenant-level sidebar permission overrides per role
CREATE TABLE "TenantRoleNavTabGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tabKeys" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRoleNavTabGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantRoleNavTabGrant_tenantId_role_key" ON "TenantRoleNavTabGrant"("tenantId", "role");

CREATE INDEX "TenantRoleNavTabGrant_tenantId_idx" ON "TenantRoleNavTabGrant"("tenantId");

ALTER TABLE "TenantRoleNavTabGrant" ADD CONSTRAINT "TenantRoleNavTabGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantRoleNavTabGrant" ADD CONSTRAINT "TenantRoleNavTabGrant_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
