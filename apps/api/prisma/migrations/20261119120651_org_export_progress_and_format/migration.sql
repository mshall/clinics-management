-- AlterTable
ALTER TABLE "TenantExportJob" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tablesJson" JSONB;
