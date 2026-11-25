-- GRW-P2-S (wave 7, lane A2): provider-sponsored promotions in the Clinic (ADR-048 Proposed, KX-30 section 14.4). Additive and idempotent.
-- A promotion is a discount the CLINIC funds from its own provider credit. Nothing here references a patient credit object and no patient identifier is stored:
-- `patientRef` is an opaque keyed hash sent by Kiorex. Money is in minor units. The budget is an append-only ledger with a race-proof cap.

ALTER TYPE "KiorlyLineType" ADD VALUE IF NOT EXISTS 'PROMOTION_EXPENSE';

DO $$ BEGIN CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','ACTIVE','PAUSED','EXHAUSTED','EXPIRED','REJECTED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionDiscountKind" AS ENUM ('FIXED_MINOR','PERCENT_BP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionFundingMode" AS ENUM ('WALLET_ONLY','WALLET_THEN_INVOICE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionReviewKind" AS ENUM ('CONTENT','SCOPE','HIGH_VALUE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionReviewDecision" AS ENUM ('APPROVED','REJECTED','NEEDS_CHANGES'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionBudgetEntryType" AS ENUM ('RESERVE','RELEASE','DEBIT','REVERSE_DEBIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PromotionReservationState" AS ENUM ('RESERVED','BOOKED','DEBITED','RELEASED','REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- commission decision reference fields (additive; not part of the decision hash)
ALTER TABLE "KiorexCommissionDecision" ADD COLUMN IF NOT EXISTS "feeBasisMinor" INTEGER;
ALTER TABLE "KiorexCommissionDecision" ADD COLUMN IF NOT EXISTS "sponsoredDiscountMinor" INTEGER;
ALTER TABLE "KiorexCommissionDecision" ADD COLUMN IF NOT EXISTS "basisPolicyVersion" TEXT;

CREATE TABLE IF NOT EXISTS "SponsoredPromotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SponsoredPromotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SponsoredPromotion_tenantId_status_idx" ON "SponsoredPromotion"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "SponsoredPromotion_status_idx" ON "SponsoredPromotion"("status");

CREATE TABLE IF NOT EXISTS "SponsoredPromotionVersion" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "patientCopyAr" TEXT NOT NULL,
    "patientCopyEn" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "discountKind" "PromotionDiscountKind" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxPerBookingMinor" INTEGER,
    "budgetCapMinor" INTEGER NOT NULL,
    "perPatientLimit" INTEGER NOT NULL DEFAULT 1,
    "perDayLimit" INTEGER,
    "eligibility" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "fundingMode" "PromotionFundingMode" NOT NULL DEFAULT 'WALLET_ONLY',
    "policyVersion" TEXT NOT NULL,
    "referencePriceMinor" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "guardResult" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SponsoredPromotionVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SponsoredPromotionVersion_promotionId_version_key" ON "SponsoredPromotionVersion"("promotionId", "version");

CREATE TABLE IF NOT EXISTS "PromotionComplianceReview" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "PromotionReviewKind" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decision" "PromotionReviewDecision",
    "reason" TEXT,
    "guardResult" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "PromotionComplianceReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionComplianceReview_versionId_kind_key" ON "PromotionComplianceReview"("versionId", "kind");
CREATE INDEX IF NOT EXISTS "PromotionComplianceReview_promotionId_idx" ON "PromotionComplianceReview"("promotionId");

CREATE TABLE IF NOT EXISTS "PromotionBudgetEntry" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "PromotionBudgetEntryType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "idempotencyKey" TEXT NOT NULL,
    "appointmentId" TEXT,
    "bookingRef" TEXT,
    "reservationId" TEXT,
    "walletEntryId" TEXT,
    "invoiceLineId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionBudgetEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionBudgetEntry_idempotencyKey_key" ON "PromotionBudgetEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PromotionBudgetEntry_promotionId_type_idx" ON "PromotionBudgetEntry"("promotionId", "type");
CREATE INDEX IF NOT EXISTS "PromotionBudgetEntry_reservationId_idx" ON "PromotionBudgetEntry"("reservationId");

CREATE TABLE IF NOT EXISTS "PromotionAudit" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PromotionAudit_promotionId_at_idx" ON "PromotionAudit"("promotionId", "at");

CREATE TABLE IF NOT EXISTS "PromotionReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reservationRef" TEXT NOT NULL,
    "bookingRef" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "careType" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "state" "PromotionReservationState" NOT NULL DEFAULT 'RESERVED',
    "appointmentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "debitedMinor" INTEGER,
    "shortfallMinor" INTEGER,
    "invoicedAt" TIMESTAMP(3),
    "invoicedPeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    CONSTRAINT "PromotionReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionReservation_reservationRef_key" ON "PromotionReservation"("reservationRef");
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionReservation_idempotencyKey_key" ON "PromotionReservation"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionReservation_promotionId_bookingRef_key" ON "PromotionReservation"("promotionId", "bookingRef");
CREATE INDEX IF NOT EXISTS "PromotionReservation_tenantId_state_idx" ON "PromotionReservation"("tenantId", "state");
CREATE INDEX IF NOT EXISTS "PromotionReservation_appointmentId_idx" ON "PromotionReservation"("appointmentId");
CREATE INDEX IF NOT EXISTS "PromotionReservation_state_expiresAt_idx" ON "PromotionReservation"("state", "expiresAt");
CREATE INDEX IF NOT EXISTS "PromotionReservation_promotionId_patientRef_idx" ON "PromotionReservation"("promotionId", "patientRef");

DO $$ BEGIN
  ALTER TABLE "SponsoredPromotion" ADD CONSTRAINT "SponsoredPromotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SponsoredPromotionVersion" ADD CONSTRAINT "SponsoredPromotionVersion_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "SponsoredPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionComplianceReview" ADD CONSTRAINT "PromotionComplianceReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SponsoredPromotionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionBudgetEntry" ADD CONSTRAINT "PromotionBudgetEntry_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "SponsoredPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionAudit" ADD CONSTRAINT "PromotionAudit_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "SponsoredPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionReservation" ADD CONSTRAINT "PromotionReservation_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "SponsoredPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- table rules
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('SponsoredPromotionVersion', 'SponsoredPromotionVersion_values_check', '"version" >= 1 AND "discountValue" >= 1 AND "budgetCapMinor" >= 1 AND "perPatientLimit" >= 1 AND "referencePriceMinor" >= 0 AND "endsAt" > "startsAt" AND ("perDayLimit" IS NULL OR "perDayLimit" >= 1) AND ("maxPerBookingMinor" IS NULL OR "maxPerBookingMinor" >= 1)'),
    ('SponsoredPromotionVersion', 'SponsoredPromotionVersion_percent_check', '"discountKind" <> ''PERCENT_BP'' OR "discountValue" <= 10000'),
    ('PromotionComplianceReview', 'PromotionComplianceReview_maker_checker_check', '"decidedBy" IS NULL OR "decidedBy" <> "requestedBy"'),
    ('PromotionComplianceReview', 'PromotionComplianceReview_decided_check', '("decidedBy" IS NULL) = ("decision" IS NULL)'),
    ('PromotionBudgetEntry', 'PromotionBudgetEntry_amount_check', '"amountMinor" > 0'),
    ('PromotionReservation', 'PromotionReservation_amount_check', '"amountMinor" > 0 AND ("debitedMinor" IS NULL OR "debitedMinor" >= 0) AND ("shortfallMinor" IS NULL OR "shortfallMinor" >= 0)'),
    ('PromotionReservation', 'PromotionReservation_care_check', '"careType" IN (''IN_CLINIC'',''VIDEO'',''HOME_VISIT'')')
  ) AS t(tbl, name, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', c.tbl, c.name, c.expr);
    END IF;
  END LOOP;
END $$;

-- append-only budget ledger and audit; immutable versions; a decided review never changes
CREATE OR REPLACE FUNCTION promotion_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "SponsoredPromotion" WHERE "id" = OLD."promotionId") THEN RETURN OLD; END IF; -- tenant closure cascades through the promotion
  RAISE EXCEPTION '% is append-only (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = '23000';
END $$;
DROP TRIGGER IF EXISTS promotion_budget_append_only ON "PromotionBudgetEntry";
CREATE TRIGGER promotion_budget_append_only BEFORE UPDATE OR DELETE ON "PromotionBudgetEntry" FOR EACH ROW EXECUTE FUNCTION promotion_append_only();
DROP TRIGGER IF EXISTS promotion_audit_append_only ON "PromotionAudit";
CREATE TRIGGER promotion_audit_append_only BEFORE UPDATE OR DELETE ON "PromotionAudit" FOR EACH ROW EXECUTE FUNCTION promotion_append_only();

CREATE OR REPLACE FUNCTION promotion_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "SponsoredPromotion" WHERE "id" = OLD."promotionId") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'SponsoredPromotionVersion is immutable: an edit creates a new version (% refused)', TG_OP USING ERRCODE = '23000';
END $$;
DROP TRIGGER IF EXISTS promotion_version_immutable_trg ON "SponsoredPromotionVersion";
CREATE TRIGGER promotion_version_immutable_trg BEFORE UPDATE OR DELETE ON "SponsoredPromotionVersion" FOR EACH ROW EXECUTE FUNCTION promotion_version_immutable();

CREATE OR REPLACE FUNCTION promotion_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM "SponsoredPromotionVersion" WHERE "id" = OLD."versionId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'PromotionComplianceReview is append-only (DELETE refused)' USING ERRCODE = '23000';
  END IF;
  IF OLD."decision" IS NOT NULL THEN RAISE EXCEPTION 'PromotionComplianceReview % is already decided', OLD."id" USING ERRCODE = '23000'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS promotion_review_guard_trg ON "PromotionComplianceReview";
CREATE TRIGGER promotion_review_guard_trg BEFORE UPDATE OR DELETE ON "PromotionComplianceReview" FOR EACH ROW EXECUTE FUNCTION promotion_review_guard();

-- the cap: at commit, reserved + debited - released - reversed of a promotion never exceeds the cap of the version the entry cites (race-proof together with FOR UPDATE on the promotion row)
CREATE OR REPLACE FUNCTION promotion_budget_cap_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exposure BIGINT; cap INTEGER;
BEGIN
  SELECT COALESCE(SUM(CASE "type" WHEN 'RESERVE' THEN "amountMinor" WHEN 'DEBIT' THEN "amountMinor" WHEN 'RELEASE' THEN -"amountMinor" WHEN 'REVERSE_DEBIT' THEN -"amountMinor" END), 0)
    INTO exposure FROM "PromotionBudgetEntry" WHERE "promotionId" = NEW."promotionId";
  SELECT "budgetCapMinor" INTO cap FROM "SponsoredPromotionVersion" WHERE "id" = NEW."versionId";
  IF exposure > cap THEN RAISE EXCEPTION 'promotion % budget cap exceeded (% > %)', NEW."promotionId", exposure, cap USING ERRCODE = '23514'; END IF;
  IF exposure < 0 THEN RAISE EXCEPTION 'promotion % budget exposure would be negative (%)', NEW."promotionId", exposure USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS promotion_budget_cap_trg ON "PromotionBudgetEntry";
CREATE CONSTRAINT TRIGGER promotion_budget_cap_trg AFTER INSERT ON "PromotionBudgetEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION promotion_budget_cap_check();
