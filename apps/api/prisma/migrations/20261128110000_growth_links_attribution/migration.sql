-- GRW-P1-D0 growth links and attribution intake (kiorex contracts 1.10.0): provider referral links and daily counters, widget settings,
-- append-only KiorexCommissionDecision, nullable Appointment acquisition columns, enum AcquisitionOrigin, CommissionDisputeReason.PROVIDER_LED_EVIDENCE.
-- Additive and idempotent (IF NOT EXISTS / guarded blocks). No existing behaviour changes: a null acquisitionOrigin means today's rules.

DO $$ BEGIN
  CREATE TYPE "ReferralLinkOwnerScope" AS ENUM ('ORG', 'CLINIC', 'BRANCH', 'DOCTOR', 'DESK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralLinkChannelKind" AS ENUM ('WEB_LINK', 'QR_POSTER', 'QR_DESK', 'SOCIAL', 'SMS', 'WHATSAPP_SHARE', 'EMAIL_SIG', 'GOOGLE_PROFILE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralLinkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AcquisitionOrigin" AS ENUM ('PROVIDER_LED', 'MARKETPLACE', 'UNATTRIBUTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionDecisionKind" AS ENUM ('CHARGE', 'NO_CHARGE', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "CommissionDisputeReason" ADD VALUE IF NOT EXISTS 'PROVIDER_LED_EVIDENCE';

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "acquisitionDecisionRef" TEXT,
ADD COLUMN IF NOT EXISTS "acquisitionOrigin" "AcquisitionOrigin",
ADD COLUMN IF NOT EXISTS "acquisitionPolicyVersion" TEXT;

CREATE TABLE IF NOT EXISTS "ProviderReferralLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "branchRef" TEXT,
    "deskLabel" TEXT,
    "ownerScope" "ReferralLinkOwnerScope" NOT NULL DEFAULT 'CLINIC',
    "channelKind" "ReferralLinkChannelKind" NOT NULL DEFAULT 'WEB_LINK',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ReferralLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderReferralLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderReferralLinkDaily" (
    "linkId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "attended" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderReferralLinkDaily_pkey" PRIMARY KEY ("linkId","date")
);

CREATE TABLE IF NOT EXISTS "BookingWidgetConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedOrigins" JSONB NOT NULL DEFAULT '[]',
    "theme" TEXT NOT NULL DEFAULT 'auto',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingWidgetConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KiorexCommissionDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "origin" "AcquisitionOrigin" NOT NULL,
    "bookingSource" "BookingSource" NOT NULL,
    "isNewPatient" BOOLEAN NOT NULL,
    "decision" "CommissionDecisionKind" NOT NULL,
    "reasonCodes" TEXT[],
    "rateId" TEXT,
    "amount" DECIMAL(14,2),
    "currency" TEXT,
    "inputsHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorexCommissionDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderReferralLink_code_key" ON "ProviderReferralLink"("code");

CREATE INDEX IF NOT EXISTS "ProviderReferralLink_tenantId_status_idx" ON "ProviderReferralLink"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "ProviderReferralLink_clinicId_status_idx" ON "ProviderReferralLink"("clinicId", "status");

CREATE INDEX IF NOT EXISTS "ProviderReferralLinkDaily_tenantId_date_idx" ON "ProviderReferralLinkDaily"("tenantId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "BookingWidgetConfig_clinicId_key" ON "BookingWidgetConfig"("clinicId");

CREATE INDEX IF NOT EXISTS "BookingWidgetConfig_tenantId_idx" ON "BookingWidgetConfig"("tenantId");

CREATE INDEX IF NOT EXISTS "KiorexCommissionDecision_tenantId_createdAt_idx" ON "KiorexCommissionDecision"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "KiorexCommissionDecision_clinicId_createdAt_idx" ON "KiorexCommissionDecision"("clinicId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "KiorexCommissionDecision_appointmentId_policyVersion_key" ON "KiorexCommissionDecision"("appointmentId", "policyVersion");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderReferralLink_tenantId_fkey') THEN
    ALTER TABLE "ProviderReferralLink" ADD CONSTRAINT "ProviderReferralLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderReferralLink_clinicId_fkey') THEN
    ALTER TABLE "ProviderReferralLink" ADD CONSTRAINT "ProviderReferralLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderReferralLinkDaily_linkId_fkey') THEN
    ALTER TABLE "ProviderReferralLinkDaily" ADD CONSTRAINT "ProviderReferralLinkDaily_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ProviderReferralLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingWidgetConfig_tenantId_fkey') THEN
    ALTER TABLE "BookingWidgetConfig" ADD CONSTRAINT "BookingWidgetConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingWidgetConfig_clinicId_fkey') THEN
    ALTER TABLE "BookingWidgetConfig" ADD CONSTRAINT "BookingWidgetConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KiorexCommissionDecision_appointmentId_fkey') THEN
    ALTER TABLE "KiorexCommissionDecision" ADD CONSTRAINT "KiorexCommissionDecision_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Integrity: CHECK constraints (named, added once)
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Exact https origins only, no wildcard, no path (mirrors @kiorex/contracts WIDGET_ORIGIN_PATTERN); at most 10 (ARCH section 11).
CREATE OR REPLACE FUNCTION growth_widget_origins_valid(origins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_typeof(origins) = 'array'
     AND jsonb_array_length(origins) <= 10
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(origins) AS e(v)
        WHERE jsonb_typeof(e.v) <> 'string'
           OR (e.v #>> '{}') !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
           OR length(e.v #>> '{}') > 255
     )
$$;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('ProviderReferralLink', 'ProviderReferralLink_code_format_check', '"code" ~ ''^[0-9A-HJKMNP-TV-Z]{8}$'''),
    ('ProviderReferralLink', 'ProviderReferralLink_label_check', 'length(btrim("label")) BETWEEN 1 AND 80'),
    ('ProviderReferralLink', 'ProviderReferralLink_scope_target_check', '("ownerScope" <> ''DOCTOR'' OR "clinicianId" IS NOT NULL) AND ("ownerScope" <> ''BRANCH'' OR "branchRef" IS NOT NULL) AND ("ownerScope" <> ''DESK'' OR "deskLabel" IS NOT NULL)'),
    ('ProviderReferralLink', 'ProviderReferralLink_revoked_check', '("status" = ''REVOKED'') = ("revokedAt" IS NOT NULL)'),
    ('ProviderReferralLinkDaily', 'ProviderReferralLinkDaily_counts_check', '"visits" >= 0 AND "bookings" >= 0 AND "attended" >= 0'),
    ('BookingWidgetConfig', 'BookingWidgetConfig_origins_check', 'growth_widget_origins_valid("allowedOrigins")'),
    ('BookingWidgetConfig', 'BookingWidgetConfig_locale_check', '"locale" IN (''ar'',''en'')'),
    ('KiorexCommissionDecision', 'KiorexCommissionDecision_hash_check', '"inputsHash" ~ ''^[0-9a-f]{64}$'''),
    ('KiorexCommissionDecision', 'KiorexCommissionDecision_charge_amount_check', '("decision" <> ''CHARGE'' OR ("amount" IS NOT NULL AND "rateId" IS NOT NULL)) AND ("decision" <> ''NO_CHARGE'' OR "amount" IS NULL)'),
    ('KiorexCommissionDecision', 'KiorexCommissionDecision_provider_led_check', '"origin" <> ''PROVIDER_LED'' OR "decision" <> ''CHARGE''')
  ) AS t(tbl, name, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', c.tbl, c.name, c.expr);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Immutability: KiorexCommissionDecision is append-only. A correction is a new row under a new policyVersion.
-- Direct UPDATE and DELETE raise. A DELETE that comes from a parent's ON DELETE CASCADE (appointment, tenant erasure) runs one trigger level
-- deeper (pg_trigger_depth() > 1) and is allowed, so removing a tenant still works.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kiorex_commission_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'KiorexCommissionDecision is append-only: % is not allowed (insert a new row under a new policyVersion)', TG_OP USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS kiorex_commission_decision_immutable ON "KiorexCommissionDecision";
CREATE TRIGGER kiorex_commission_decision_immutable BEFORE UPDATE OR DELETE ON "KiorexCommissionDecision" FOR EACH ROW EXECUTE FUNCTION kiorex_commission_decision_guard();
