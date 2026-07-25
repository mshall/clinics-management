-- CreateTable
CREATE TABLE "UserClinicEmployeePrivilegeGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "templateEmployeeId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClinicEmployeePrivilegeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClinicEmployeePrivilegeGrant_tenantId_userId_idx" ON "UserClinicEmployeePrivilegeGrant"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "UserClinicEmployeePrivilegeGrant_tenantId_clinicId_idx" ON "UserClinicEmployeePrivilegeGrant"("tenantId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClinicEmployeePrivilegeGrant_userId_clinicId_key" ON "UserClinicEmployeePrivilegeGrant"("userId", "clinicId");

-- AddForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" ADD CONSTRAINT "UserClinicEmployeePrivilegeGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" ADD CONSTRAINT "UserClinicEmployeePrivilegeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" ADD CONSTRAINT "UserClinicEmployeePrivilegeGrant_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" ADD CONSTRAINT "UserClinicEmployeePrivilegeGrant_templateEmployeeId_fkey" FOREIGN KEY ("templateEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" ADD CONSTRAINT "UserClinicEmployeePrivilegeGrant_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
