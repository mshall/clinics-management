-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "defaultTaxRegistrationNumber" TEXT NOT NULL DEFAULT 'N/A',
ADD COLUMN     "defaultInvoiceVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 5;

-- Align clinics without TRN to organization default placeholder
UPDATE "Clinic" SET "taxRegistrationNumber" = 'N/A'
WHERE "taxRegistrationNumber" IS NULL OR TRIM("taxRegistrationNumber") = '';
