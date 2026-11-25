-- Contracts 1.13.0: optional Kiorex acquisition block on a care plan request (evidence only; additive, nullable).
ALTER TABLE "CarePlanRequest" ADD COLUMN "acquisition" JSONB;
