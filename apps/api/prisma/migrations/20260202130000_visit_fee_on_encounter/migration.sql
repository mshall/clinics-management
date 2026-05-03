-- Visit/consultation fee belongs on encounters (actual visit), not appointments (scheduling only).
ALTER TABLE "Tenant" RENAME COLUMN "appointmentDefaultFee" TO "defaultVisitFee";

ALTER TABLE "Encounter" ADD COLUMN "visitFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "RevenueEntry" ADD COLUMN "encounterId" TEXT;
CREATE INDEX "RevenueEntry_encounterId_idx" ON "RevenueEntry"("encounterId");
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment" DROP COLUMN "feeAmount";
