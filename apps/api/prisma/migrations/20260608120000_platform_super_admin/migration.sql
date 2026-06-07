-- Platform super administrator: no organization membership (nullable tenantId).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_SUPER_ADMIN';

ALTER TABLE "User" ALTER COLUMN "tenantId" DROP NOT NULL;
