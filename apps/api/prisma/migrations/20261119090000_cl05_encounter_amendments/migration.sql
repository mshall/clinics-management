-- CL-05: append-only encounter amendment trail
CREATE TABLE "EncounterAmendment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amendedByUserId" TEXT,
    "amendedByName" TEXT NOT NULL,
    "amendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasLocked" BOOLEAN NOT NULL DEFAULT false,
    "resignedByUserId" TEXT,
    "resignedByName" TEXT,
    "resignedAt" TIMESTAMP(3),

    CONSTRAINT "EncounterAmendment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EncounterAmendment_tenantId_idx" ON "EncounterAmendment"("tenantId");
CREATE INDEX "EncounterAmendment_encounterId_amendedAt_idx" ON "EncounterAmendment"("encounterId", "amendedAt");

ALTER TABLE "EncounterAmendment" ADD CONSTRAINT "EncounterAmendment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterAmendment" ADD CONSTRAINT "EncounterAmendment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the single amendReason column held only the latest amendment.
INSERT INTO "EncounterAmendment" ("id", "tenantId", "encounterId", "reason", "amendedByUserId", "amendedByName", "amendedAt", "resignedByUserId", "resignedAt")
SELECT
    'amd_' || e."id",
    e."tenantId",
    e."id",
    e."amendReason",
    e."amendedByUserId",
    COALESCE(u."displayName", ''),
    COALESCE(e."amendedAt", e."updatedAt"),
    CASE WHEN e."status" = 'FINALIZED' AND e."signedAt" > COALESCE(e."amendedAt", e."updatedAt") THEN e."signedByUserId" END,
    CASE WHEN e."status" = 'FINALIZED' AND e."signedAt" > COALESCE(e."amendedAt", e."updatedAt") THEN e."signedAt" END
FROM "Encounter" e
LEFT JOIN "User" u ON u."id" = e."amendedByUserId"
WHERE e."amendReason" IS NOT NULL;
