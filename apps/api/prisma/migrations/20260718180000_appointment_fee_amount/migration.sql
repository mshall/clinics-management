-- Scheduled appointment fee (kept in sync with linked encounter visit fee).
ALTER TABLE "Appointment" ADD COLUMN "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "Appointment" a
SET "feeAmount" = sub."visitFeeAmount"
FROM (
  SELECT DISTINCT ON ("appointmentId") "appointmentId", "visitFeeAmount"
  FROM "Encounter"
  WHERE "appointmentId" IS NOT NULL
  ORDER BY "appointmentId", "updatedAt" DESC
) sub
WHERE a.id = sub."appointmentId";
