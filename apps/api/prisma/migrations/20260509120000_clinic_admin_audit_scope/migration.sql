-- New roles
ALTER TYPE "UserRole" ADD VALUE 'CLINIC_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'CLINIC_ASSISTANT';

-- Optional clinic context on audit rows
ALTER TABLE "AuditLog" ADD COLUMN "clinicId" TEXT;

-- Clinic admin ↔ clinic assignments (super admin assigns)
CREATE TABLE "ClinicAdminScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAdminScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicAdminScope_userId_clinicId_key" ON "ClinicAdminScope"("userId", "clinicId");
CREATE INDEX "ClinicAdminScope_tenantId_userId_idx" ON "ClinicAdminScope"("tenantId", "userId");

ALTER TABLE "ClinicAdminScope" ADD CONSTRAINT "ClinicAdminScope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicAdminScope" ADD CONSTRAINT "ClinicAdminScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicAdminScope" ADD CONSTRAINT "ClinicAdminScope_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditLog_tenantId_clinicId_idx" ON "AuditLog"("tenantId", "clinicId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
