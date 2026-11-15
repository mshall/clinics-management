-- Markets (country packs), fiscal provider tables, tenant deployment cell

CREATE TYPE "MarketLaunchStatus" AS ENUM ('DRAFT', 'LIVE', 'SUNSET');
CREATE TYPE "FiscalSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL DEFAULT '',
    "status" "MarketLaunchStatus" NOT NULL DEFAULT 'DRAFT',
    "launchedAt" TIMESTAMP(3),
    "dataRegion" TEXT NOT NULL DEFAULT 'eu-central-1',
    "hostCell" TEXT NOT NULL DEFAULT 'frankfurt',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EGP',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "weekendDays" JSONB NOT NULL DEFAULT '[5, 6]',
    "enabledLanguages" JSONB NOT NULL DEFAULT '["en", "ar"]',
    "defaultPhoneRegion" TEXT NOT NULL DEFAULT 'EG',
    "idDocumentTypes" JSONB NOT NULL DEFAULT '[]',
    "taxConfig" JSONB NOT NULL DEFAULT '{}',
    "providerConfig" JSONB NOT NULL DEFAULT '{}',
    "clinicalConfig" JSONB NOT NULL DEFAULT '{}',
    "legalConfig" JSONB NOT NULL DEFAULT '{}',
    "paymentMethods" JSONB NOT NULL DEFAULT '[]',
    "featureDefaults" JSONB NOT NULL DEFAULT '{}',
    "settingsSchema" JSONB NOT NULL DEFAULT '{}',
    "translations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Market_code_key" ON "Market"("code");

CREATE TABLE "MarketFeatureFlag" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketFeatureFlag_marketId_key_key" ON "MarketFeatureFlag"("marketId", "key");

CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT,
    "providerKey" TEXT NOT NULL,
    "deviceId" TEXT,
    "secretRef" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderCredential_tenantId_providerKey_idx" ON "ProviderCredential"("tenantId", "providerKey");

CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "revenueEntryId" TEXT,
    "invoiceId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "payloadJson" JSONB,
    "schemaVersion" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalDocument_paymentId_key" ON "FiscalDocument"("paymentId");
CREATE UNIQUE INDEX "FiscalDocument_revenueEntryId_key" ON "FiscalDocument"("revenueEntryId");
CREATE UNIQUE INDEX "FiscalDocument_invoiceId_key" ON "FiscalDocument"("invoiceId");

CREATE TABLE "FiscalSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" "FiscalSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "providerDocumentUuid" TEXT,
    "payloadJson" JSONB,
    "signature" TEXT,
    "idempotencyKey" TEXT,
    "submittedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalSubmission_fiscalDocumentId_key" ON "FiscalSubmission"("fiscalDocumentId");
CREATE UNIQUE INDEX "FiscalSubmission_idempotencyKey_key" ON "FiscalSubmission"("idempotencyKey");

ALTER TABLE "Tenant" ADD COLUMN "marketId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "deploymentCell" TEXT NOT NULL DEFAULT 'frankfurt';

ALTER TABLE "Clinic" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "weekendDays" JSONB;
ALTER TABLE "Clinic" ADD COLUMN "settingsOverrides" JSONB;

-- Egypt market pack (Frankfurt cell — government consent for data residency)
INSERT INTO "Market" (
    "id", "code", "nameEn", "nameAr", "status", "launchedAt",
    "dataRegion", "hostCell", "defaultCurrency", "defaultLocale", "defaultTimezone",
    "defaultPhoneRegion", "taxConfig", "providerConfig", "paymentMethods", "featureDefaults", "updatedAt"
) VALUES (
    'market-egypt',
    'EG',
    'Egypt',
    'مصر',
    'LIVE',
    CURRENT_TIMESTAMP,
    'eu-central-1',
    'frankfurt',
    'EGP',
    'ar',
    'Africa/Cairo',
    'EG',
    '{"defaultVatPercent":14,"defaultActivityCode":"8690","fiscalProviderKey":"eta-egypt"}',
    '{"fiscal":{"key":"eta-egypt","enabled":true},"messaging":{"whatsapp":{"enabled":false}}}',
    '[{"key":"CASH","labelKey":"payment.cash"},{"key":"INSTAPAY","labelKey":"payment.instapay","transferChannel":"INSTAPAY"},{"key":"FAWRY","labelKey":"payment.fawry","transferChannel":"FAWRY"},{"key":"CARD","labelKey":"payment.card"}]',
    '{"etaReceipts":true,"whatsAppReminders":false}',
    CURRENT_TIMESTAMP
);

-- Migrate ETA rows to fiscal tables
INSERT INTO "FiscalDocument" (
    "id", "tenantId", "clinicId", "patientId", "providerKey",
    "paymentId", "revenueEntryId", "invoiceId", "currency", "totalAmount", "payloadJson", "schemaVersion", "createdAt"
)
SELECT
    e."id",
    e."tenantId",
    e."clinicId",
    e."patientId",
    'eta-egypt',
    e."paymentId",
    e."revenueEntryId",
    e."invoiceId",
    COALESCE((e."payloadJson"->>'currency'), 'EGP'),
    COALESCE((e."payloadJson"->>'totalAmount')::numeric, 0),
    e."payloadJson",
    'eta-egypt-v1',
    e."createdAt"
FROM "EtaReceiptSubmission" e;

INSERT INTO "FiscalSubmission" (
    "id", "tenantId", "clinicId", "patientId", "fiscalDocumentId", "providerKey",
    "status", "providerDocumentUuid", "payloadJson", "signature", "idempotencyKey",
    "submittedAt", "errorMessage", "createdAt"
)
SELECT
    e."id" || '-sub',
    e."tenantId",
    e."clinicId",
    e."patientId",
    e."id",
    'eta-egypt',
    e."status"::text::"FiscalSubmissionStatus",
    e."etaUuid",
    e."payloadJson",
    e."signature",
    e."idempotencyKey",
    e."submittedAt",
    e."errorMessage",
    e."createdAt"
FROM "EtaReceiptSubmission" e;

UPDATE "Tenant" SET "marketId" = 'market-egypt', "deploymentCell" = 'frankfurt' WHERE "marketId" IS NULL;

-- Drop legacy ETA submission table (data preserved in fiscal tables)
DROP TABLE "EtaReceiptSubmission";
DROP TYPE "EtaReceiptStatus";

ALTER TABLE "MarketFeatureFlag" ADD CONSTRAINT "MarketFeatureFlag_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_revenueEntryId_fkey" FOREIGN KEY ("revenueEntryId") REFERENCES "RevenueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscalSubmission" ADD CONSTRAINT "FiscalSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalSubmission" ADD CONSTRAINT "FiscalSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalSubmission" ADD CONSTRAINT "FiscalSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalSubmission" ADD CONSTRAINT "FiscalSubmission_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;