-- AlterTable
ALTER TABLE "IntegrationFailureLog" ADD COLUMN     "operationName" TEXT,
ADD COLUMN     "operationTypeLabel" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reasonDetail" TEXT;
