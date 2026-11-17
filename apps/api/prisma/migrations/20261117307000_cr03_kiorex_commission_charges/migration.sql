-- CreateEnum
CREATE TYPE "CommissionChargeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED', 'REVERSED', 'WAIVED', 'BILLED');

-- CreateTable
CREATE TABLE "KiorexCommissionCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "rateId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "CommissionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "attendedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "disputeDeadline" TIMESTAMP(3) NOT NULL,
    "kiorlyInvoiceId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexCommissionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KiorexCommissionCharge_appointmentId_key" ON "KiorexCommissionCharge"("appointmentId");

-- CreateIndex
CREATE INDEX "KiorexCommissionCharge_tenantId_status_attendedAt_idx" ON "KiorexCommissionCharge"("tenantId", "status", "attendedAt");

-- CreateIndex
CREATE INDEX "KiorexCommissionCharge_tenantId_attendedAt_idx" ON "KiorexCommissionCharge"("tenantId", "attendedAt");

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "KiorexCommissionRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiorexCommissionCharge" ADD CONSTRAINT "KiorexCommissionCharge_kiorlyInvoiceId_fkey" FOREIGN KEY ("kiorlyInvoiceId") REFERENCES "KiorlyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;