-- GRW-P2-C provider marketing portal completion (contracts 1.12.0): social templates, share log (counts), recommendation state, verification update requests, statement exports. Additive and idempotent.
DO $$ BEGIN
  CREATE TYPE "SocialTemplateKind" AS ENUM ('POST', 'STORY', 'FLYER', 'WHATSAPP_MESSAGE', 'SMS_TEXT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SocialTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProviderRecommendationStatus" AS ENUM ('OPEN', 'DISMISSED', 'SNOOZED', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationUpdateField" AS ENUM ('LICENSE_NUMBER', 'SPECIALTY', 'ADDRESS', 'DISPLAY_NAME', 'PHOTO', 'DOCUMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationUpdateStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatementExportKind" AS ENUM ('PDF', 'CSV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SocialContentTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "SocialTemplateKind" NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "layoutKey" TEXT NOT NULL DEFAULT 'plain',
    "protectedFooter" TEXT NOT NULL,
    "status" "SocialTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialContentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialShareLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialShareLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderRecommendationState" (
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "ProviderRecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "until" TIMESTAMP(3),
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRecommendationState_pkey" PRIMARY KEY ("clinicId","key")
);

CREATE TABLE IF NOT EXISTS "ProviderVerificationUpdateRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "field" "VerificationUpdateField" NOT NULL,
    "oldRef" TEXT,
    "newValueEnc" TEXT NOT NULL,
    "evidenceFileRefs" JSONB NOT NULL DEFAULT '[]',
    "status" "VerificationUpdateStatus" NOT NULL DEFAULT 'SUBMITTED',
    "kiorexRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderVerificationUpdateRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CommissionStatementExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "StatementExportKind" NOT NULL,
    "fileRef" TEXT,
    "checksum" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionStatementExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialContentTemplate_status_kind_locale_idx" ON "SocialContentTemplate"("status", "kind", "locale");

CREATE UNIQUE INDEX IF NOT EXISTS "SocialContentTemplate_slug_locale_version_key" ON "SocialContentTemplate"("slug", "locale", "version");

CREATE INDEX IF NOT EXISTS "SocialShareLog_tenantId_createdAt_idx" ON "SocialShareLog"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "SocialShareLog_templateId_idx" ON "SocialShareLog"("templateId");

CREATE INDEX IF NOT EXISTS "ProviderRecommendationState_tenantId_idx" ON "ProviderRecommendationState"("tenantId");

CREATE INDEX IF NOT EXISTS "ProviderVerificationUpdateRequest_tenantId_status_idx" ON "ProviderVerificationUpdateRequest"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "ProviderVerificationUpdateRequest_clinicId_createdAt_idx" ON "ProviderVerificationUpdateRequest"("clinicId", "createdAt");

CREATE INDEX IF NOT EXISTS "CommissionStatementExport_tenantId_month_idx" ON "CommissionStatementExport"("tenantId", "month");

DO $$ BEGIN
  ALTER TABLE "SocialShareLog" ADD CONSTRAINT "SocialShareLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SocialShareLog" ADD CONSTRAINT "SocialShareLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderRecommendationState" ADD CONSTRAINT "ProviderRecommendationState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderRecommendationState" ADD CONSTRAINT "ProviderRecommendationState_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderVerificationUpdateRequest" ADD CONSTRAINT "ProviderVerificationUpdateRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderVerificationUpdateRequest" ADD CONSTRAINT "ProviderVerificationUpdateRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CommissionStatementExport" ADD CONSTRAINT "CommissionStatementExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
