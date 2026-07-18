-- Clinic invoice branding settings
ALTER TABLE "Clinic" ADD COLUMN "invoiceLogoRelativePath" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "invoiceLogoOriginalName" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "invoiceLogoMimeType" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "invoiceBackgroundColor" TEXT NOT NULL DEFAULT 'white';
ALTER TABLE "Clinic" ADD COLUMN "invoiceSections" JSONB NOT NULL DEFAULT '["clinicHeader","patientDetails","invoiceMeta","lineItems","totals","footer"]';

-- Patient invoices linked to encounters or operations
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "operationId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL,
    "backgroundColor" TEXT NOT NULL,
    "sectionsSnapshot" JSONB NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientMrn" TEXT,
    "clinicNameEn" TEXT NOT NULL,
    "clinicNameAr" TEXT NOT NULL,
    "clinicAddressEn" TEXT NOT NULL,
    "clinicAddressAr" TEXT NOT NULL,
    "clinicPhone" TEXT NOT NULL,
    "clinicEmail" TEXT NOT NULL,
    "clinicLicenseNumber" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_clinicId_invoiceNumber_key" ON "Invoice"("clinicId", "invoiceNumber");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");
CREATE INDEX "Invoice_clinicId_idx" ON "Invoice"("clinicId");
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");
CREATE INDEX "Invoice_encounterId_idx" ON "Invoice"("encounterId");
CREATE INDEX "Invoice_operationId_idx" ON "Invoice"("operationId");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
