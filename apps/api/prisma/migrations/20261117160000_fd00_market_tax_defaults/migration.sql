-- FD-00: derive tenant/clinic tax & fees from market pack; drop UAE-style column defaults

ALTER TABLE "Tenant" ALTER COLUMN "defaultVisitFee" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "defaultVisitFee" DROP NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "defaultTaxRegistrationNumber" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "defaultTaxRegistrationNumber" DROP NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "defaultInvoiceVatPercent" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "defaultInvoiceVatPercent" DROP NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "deploymentCell" DROP DEFAULT;

ALTER TABLE "Clinic" ALTER COLUMN "invoiceVatPercent" DROP DEFAULT;
ALTER TABLE "Clinic" ALTER COLUMN "invoiceVatPercent" DROP NOT NULL;

ALTER TABLE "Market" ALTER COLUMN "hostCell" DROP DEFAULT;

UPDATE "Market"
SET "taxConfig" = COALESCE("taxConfig", '{}'::jsonb) || '{
  "invoiceVatPercent": 0,
  "saasVatPercent": 14,
  "defaultVisitFee": 300,
  "trnFormat": "^[0-9]{9}$",
  "trnRequired": true
}'::jsonb
WHERE "id" = 'market-egypt';

UPDATE "Tenant" t
SET
  "deploymentCell" = m."hostCell",
  "defaultVisitFee" = 300,
  "defaultInvoiceVatPercent" = 0,
  "defaultTaxRegistrationNumber" = NULLIF(TRIM("defaultTaxRegistrationNumber"), 'N/A')
FROM "Market" m
WHERE t."marketId" = m."id" AND m."code" = 'EG';

INSERT INTO "AuditLog" ("id", "tenantId", "action", "resource", "resourceId", "metadata", "createdAt")
SELECT
  'fd00-tenant-' || t."id",
  t."id",
  'MARKET_TAX_PACK_BACKFILL',
  'tenant',
  t."id",
  jsonb_build_object(
    'marketCode', 'EG',
    'defaultVisitFee', 300,
    'defaultInvoiceVatPercent', 0,
    'defaultTaxRegistrationNumber', t."defaultTaxRegistrationNumber"
  ),
  CURRENT_TIMESTAMP
FROM "Tenant" t
JOIN "Market" m ON m."id" = t."marketId"
WHERE m."code" = 'EG';

UPDATE "Clinic" c
SET
  "invoiceVatPercent" = 0,
  "taxRegistrationNumber" = NULLIF(TRIM(c."taxRegistrationNumber"), 'N/A')
FROM "Tenant" t
JOIN "Market" m ON m."id" = t."marketId"
WHERE c."tenantId" = t."id" AND m."code" = 'EG'
  AND (c."invoiceVatPercent" IS DISTINCT FROM 0 OR TRIM(COALESCE(c."taxRegistrationNumber", '')) IN ('N/A', '') OR c."invoiceVatPercent" = 5);

INSERT INTO "AuditLog" ("id", "tenantId", "clinicId", "action", "resource", "resourceId", "metadata", "createdAt")
SELECT
  'fd00-clinic-' || c."id",
  c."tenantId",
  c."id",
  'MARKET_TAX_PACK_BACKFILL',
  'clinic',
  c."id",
  jsonb_build_object(
    'marketCode', 'EG',
    'invoiceVatPercent', c."invoiceVatPercent",
    'taxRegistrationNumber', c."taxRegistrationNumber"
  ),
  CURRENT_TIMESTAMP
FROM "Clinic" c
JOIN "Tenant" t ON t."id" = c."tenantId"
JOIN "Market" m ON m."id" = t."marketId"
WHERE m."code" = 'EG';