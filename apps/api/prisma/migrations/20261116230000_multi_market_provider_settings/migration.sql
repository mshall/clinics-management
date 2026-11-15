-- Multi-market: providerSettings JSON, drop Egypt-specific columns, string transfer channels, market defaults without DB Egypt fallbacks

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "providerSettings" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "providerSettings" JSONB NOT NULL DEFAULT '{}';

UPDATE "Clinic"
SET "providerSettings" = COALESCE("providerSettings", '{}'::jsonb) || jsonb_build_object(
  'eta-egypt', jsonb_strip_nulls(jsonb_build_object(
    'branchCode', "etaBranchCode",
    'taxpayerActivityCode', "etaTaxpayerActivityCode",
    'defaultItemCode', "etaDefaultItemCode",
    'receiptsEnabled', COALESCE("etaReceiptsEnabled", true),
    'includeLogoOnReceipt', COALESCE("etaIncludeLogoOnReceipt", true)
  ))
)
WHERE "etaBranchCode" IS NOT NULL
   OR "etaTaxpayerActivityCode" IS NOT NULL
   OR "etaDefaultItemCode" IS NOT NULL
   OR "etaReceiptsEnabled" IS NOT NULL
   OR "etaIncludeLogoOnReceipt" IS NOT NULL;

UPDATE "Tenant"
SET "providerSettings" = COALESCE("providerSettings", '{}'::jsonb) || jsonb_build_object(
  'eta-egypt', jsonb_strip_nulls(jsonb_build_object(
    'defaultTaxpayerActivityCode', COALESCE("etaDefaultTaxpayerActivityCode", '8690'),
    'defaultItemCode', "etaDefaultItemCode",
    'esignatureLabel', "etaEsignatureLabel"
  ))
)
WHERE "etaDefaultTaxpayerActivityCode" IS NOT NULL
   OR "etaDefaultItemCode" IS NOT NULL
   OR "etaEsignatureLabel" IS NOT NULL;

ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "etaBranchCode";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "etaTaxpayerActivityCode";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "etaDefaultItemCode";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "etaReceiptsEnabled";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "etaIncludeLogoOnReceipt";

ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "etaDefaultTaxpayerActivityCode";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "etaDefaultItemCode";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "etaEsignatureLabel";

-- Money transfer channel: enum -> text
ALTER TABLE "RevenueEntry" ALTER COLUMN "transferChannel" TYPE TEXT USING "transferChannel"::TEXT;
ALTER TABLE "Appointment" ALTER COLUMN "checkInTransferChannel" TYPE TEXT USING "checkInTransferChannel"::TEXT;
DROP TYPE IF EXISTS "MoneyTransferChannel";

-- Egypt market payment methods: reference validation patterns
UPDATE "Market"
SET "paymentMethods" = '[
  {"key":"CASH","labelKey":"payment.cash"},
  {"key":"INSTAPAY","labelKey":"payment.instapay","transferChannel":"INSTAPAY","referencePattern":"^[A-Za-z0-9][A-Za-z0-9\\\\-_.]{5,31}$","verifyUrlEnv":"INSTAPAY_VERIFY_URL"},
  {"key":"FAWRY","labelKey":"payment.fawry","transferChannel":"FAWRY","referencePattern":"^[A-Za-z0-9]{8,20}$","verifyUrlEnv":"FAWRY_VERIFY_URL"},
  {"key":"CARD","labelKey":"payment.card"}
]'::jsonb
WHERE "id" = 'market-egypt';

-- Drop implicit Egypt defaults on Market (pack must define values explicitly)
ALTER TABLE "Market" ALTER COLUMN "defaultCurrency" DROP DEFAULT;
ALTER TABLE "Market" ALTER COLUMN "defaultLocale" DROP DEFAULT;
ALTER TABLE "Market" ALTER COLUMN "defaultTimezone" DROP DEFAULT;
ALTER TABLE "Market" ALTER COLUMN "weekendDays" DROP DEFAULT;
ALTER TABLE "Market" ALTER COLUMN "enabledLanguages" DROP DEFAULT;
ALTER TABLE "Market" ALTER COLUMN "defaultPhoneRegion" DROP DEFAULT;

ALTER TABLE "FiscalDocument" ALTER COLUMN "currency" DROP DEFAULT;