-- COM-2: a commission charge may be priced by the organisation's Kiorex rate (default per type or own rate) instead of a market rate row.
ALTER TABLE "KiorexCommissionCharge" ALTER COLUMN "rateId" DROP NOT NULL;
ALTER TABLE "KiorexCommissionCharge" ADD COLUMN IF NOT EXISTS "rateSource" TEXT;
ALTER TABLE "KiorexCommissionCharge" ADD COLUMN IF NOT EXISTS "rateVersion" INTEGER;

-- the append-only decision names where the price came from: a market rate row (rateId) or the Kiorex rate of the organisation (rateSource KIOREX_DEFAULT / KIOREX_OVERRIDE, with the version in the policy version)
ALTER TABLE "KiorexCommissionDecision" ADD COLUMN IF NOT EXISTS "rateSource" TEXT;
ALTER TABLE "KiorexCommissionDecision" DROP CONSTRAINT IF EXISTS "KiorexCommissionDecision_charge_amount_check";
ALTER TABLE "KiorexCommissionDecision" ADD CONSTRAINT "KiorexCommissionDecision_charge_amount_check"
  CHECK (("decision" <> 'CHARGE' OR ("amount" IS NOT NULL AND ("rateId" IS NOT NULL OR "rateSource" IS NOT NULL))) AND ("decision" <> 'NO_CHARGE' OR "amount" IS NULL));
