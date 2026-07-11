-- CreateEnum
CREATE TYPE "EmployeeRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmployeeSeparationReason" AS ENUM ('RESIGNATION');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "recordStatus" "EmployeeRecordStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN "resignationDate" DATE;
ALTER TABLE "Employee" ADD COLUMN "separationReason" "EmployeeSeparationReason";

-- CreateTable
CREATE TABLE "EmployeeEmploymentPeriod" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "separationReason" "EmployeeSeparationReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEmploymentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeEmploymentPeriod_employeeId_idx" ON "EmployeeEmploymentPeriod"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentPeriod_employeeId_startDate_idx" ON "EmployeeEmploymentPeriod"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "Employee_recordStatus_idx" ON "Employee"("recordStatus");

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentPeriod" ADD CONSTRAINT "EmployeeEmploymentPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
