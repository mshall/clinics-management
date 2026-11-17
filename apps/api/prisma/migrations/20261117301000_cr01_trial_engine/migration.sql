-- CR-01 trial engine columns
ALTER TABLE "Subscription" ADD COLUMN "trialQualifiedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialShortenWarnedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialConfigOverride" JSONB;
ALTER TABLE "Subscription" ADD COLUMN "postTrialGraceUntil" TIMESTAMP(3);