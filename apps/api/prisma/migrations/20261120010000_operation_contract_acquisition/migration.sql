-- Operation contract (تعاقد) flag + acquisition snapshot for channel revenue reporting.
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "isContract" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "acquisitionChannel" "PatientAcquisitionChannel";

CREATE INDEX IF NOT EXISTS "Operation_tenantId_isContract_operationDate_idx"
  ON "Operation"("tenantId", "isContract", "operationDate");

CREATE INDEX IF NOT EXISTS "Operation_tenantId_acquisitionChannel_operationDate_idx"
  ON "Operation"("tenantId", "acquisitionChannel", "operationDate");

-- Backfill acquisition from patient profile where missing.
UPDATE "Operation" o
SET "acquisitionChannel" = p."acquisitionChannel"
FROM "Patient" p
WHERE o."patientId" = p."id"
  AND o."acquisitionChannel" IS NULL
  AND p."acquisitionChannel" IS NOT NULL;
