-- Default appointment fee (amount) configurable per tenant; stored on each appointment at booking time.
ALTER TABLE "Tenant" ADD COLUMN "appointmentDefaultFee" DECIMAL(14,2) NOT NULL DEFAULT 150;

ALTER TABLE "Appointment" ADD COLUMN "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Optional ID / passport scan for employees
ALTER TABLE "Employee" ADD COLUMN "idDocRelativePath" TEXT;
ALTER TABLE "Employee" ADD COLUMN "idDocOriginalName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "idDocMimeType" TEXT;

-- Link revenue lines created from appointments (optional FK)
ALTER TABLE "RevenueEntry" ADD COLUMN "appointmentId" TEXT;
CREATE INDEX "RevenueEntry_appointmentId_idx" ON "RevenueEntry"("appointmentId");
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
