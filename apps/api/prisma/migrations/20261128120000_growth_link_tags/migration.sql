-- GRW-P1-D1: campaign and UTM tags on provider referral links (additive, idempotent).
ALTER TABLE "ProviderReferralLink" ADD COLUMN IF NOT EXISTS "tags" JSONB;
