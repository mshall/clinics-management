-- ADR-039: entitlement telehealth_video is ON for every plan for now (configurable later in plans-matrix.ts + a new migration/seed).
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "valueJson", "createdAt", "updatedAt")
SELECT 'ent_telehealth_' || p."id", p."id", 'telehealth_video', 'true'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Plan" p
ON CONFLICT ("planId", "key") DO NOTHING;
