-- DropForeignKey
ALTER TABLE "UserClinicEmployeePrivilegeGrant" DROP CONSTRAINT "UserClinicEmployeePrivilegeGrant_templateEmployeeId_fkey";

-- AlterTable
ALTER TABLE "UserClinicEmployeePrivilegeGrant" DROP COLUMN "templateEmployeeId";
