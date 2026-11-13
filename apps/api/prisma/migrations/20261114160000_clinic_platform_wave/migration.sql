-- Operation workflow + billing/compliance/messaging foundation

ALTER TYPE "OperationStatus" ADD VALUE 'BOOKED';
ALTER TYPE "OperationStatus" ADD VALUE 'PRE_OP';
ALTER TYPE "OperationStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "OperationStatus" ADD VALUE 'RECOVERY';
ALTER TYPE "OperationStatus" ADD VALUE 'DISCHARGED';

ALTER TYPE "OperationDocumentKind" ADD VALUE 'CONSENT';
ALTER TYPE "OperationDocumentKind" ADD VALUE 'OPERATION_NOTE';

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'WALLET', 'OTHER');
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');
CREATE TYPE "EtaReceiptStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED');
CREATE TYPE "RecallCampaignKind" AS ENUM ('CHECKUP_DUE', 'LAPSED', 'BIRTHDAY', 'CUSTOM');

ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "operationNote" JSONB;

ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(14,2);
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "serviceCatalogItemId" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "discountNeedsApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "noShowRiskScore" DECIMAL(5,2);

CREATE TABLE "OperationPreOpCheckItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationPreOpCheckItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationSupplyUsed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "catalogCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationSupplyUsed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationInstallment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationInstallment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServicePrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServicePrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayerCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "contractRef" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayerCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractServicePrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payerCompanyId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "patientCopayPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractServicePrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "cashierUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "BillingPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "reason" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientServicePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "totalSessions" INTEGER NOT NULL,
    "sessionsRemaining" INTEGER NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "expiresOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientServicePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashierShiftClose" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "shiftDate" DATE NOT NULL,
    "expectedCash" DECIMAL(14,2) NOT NULL,
    "countedCash" DECIMAL(14,2) NOT NULL,
    "expectedCard" DECIMAL(14,2) NOT NULL,
    "countedCard" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashierShiftClose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "serviceCatalogItemId" TEXT,
    "ruleType" TEXT NOT NULL DEFAULT 'PERCENT',
    "percent" DECIMAL(5,2),
    "fixedAmount" DECIMAL(14,2),
    "roomRental" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayerPreAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payerCompanyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "approvedAmount" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "validUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayerPreAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EtaReceiptSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "EtaReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "etaUuid" TEXT,
    "payloadJson" JSONB,
    "submittedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtaReceiptSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientDataProtectionConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedOnTablet" BOOLEAN NOT NULL DEFAULT true,
    "signerName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientDataProtectionConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "subjectEn" TEXT,
    "subjectAr" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "templateKey" TEXT,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecallCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "RecallCampaignKind" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "acquisitionChannel" "PatientAcquisitionChannel",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecallCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatisfactionSurveyResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "encounterId" TEXT,
    "clinicianId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SatisfactionSurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "reportedByUserId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "summaryEn" TEXT NOT NULL,
    "summaryAr" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiScribeSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "transcript" TEXT,
    "draftNote" JSONB,
    "draftRx" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiScribeSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceCatalogItem_tenantId_code_key" ON "ServiceCatalogItem"("tenantId", "code");
CREATE INDEX "ServiceCatalogItem_tenantId_active_idx" ON "ServiceCatalogItem"("tenantId", "active");
CREATE INDEX "ServicePrice_catalogItemId_effectiveFrom_idx" ON "ServicePrice"("catalogItemId", "effectiveFrom");
CREATE INDEX "PayerCompany_tenantId_active_idx" ON "PayerCompany"("tenantId", "active");
CREATE UNIQUE INDEX "MessageTemplate_tenantId_key_channel_key" ON "MessageTemplate"("tenantId", "key", "channel");
CREATE UNIQUE INDEX "EtaReceiptSubmission_paymentId_key" ON "EtaReceiptSubmission"("paymentId");

ALTER TABLE "OperationPreOpCheckItem" ADD CONSTRAINT "OperationPreOpCheckItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationSupplyUsed" ADD CONSTRAINT "OperationSupplyUsed_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationInstallment" ADD CONSTRAINT "OperationInstallment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePrice" ADD CONSTRAINT "ServicePrice_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayerCompany" ADD CONSTRAINT "PayerCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractServicePrice" ADD CONSTRAINT "ContractServicePrice_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "PayerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractServicePrice" ADD CONSTRAINT "ContractServicePrice_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_serviceCatalogItemId_fkey" FOREIGN KEY ("serviceCatalogItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingPaymentAllocation" ADD CONSTRAINT "BillingPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientServicePackage" ADD CONSTRAINT "PatientServicePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientServicePackage" ADD CONSTRAINT "PatientServicePackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierShiftClose" ADD CONSTRAINT "CashierShiftClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierShiftClose" ADD CONSTRAINT "CashierShiftClose_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayerPreAuthorization" ADD CONSTRAINT "PayerPreAuthorization_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "PayerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EtaReceiptSubmission" ADD CONSTRAINT "EtaReceiptSubmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientDataProtectionConsent" ADD CONSTRAINT "PatientDataProtectionConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecallCampaign" ADD CONSTRAINT "RecallCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurveyResponse" ADD CONSTRAINT "SatisfactionSurveyResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurveyResponse" ADD CONSTRAINT "SatisfactionSurveyResponse_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
